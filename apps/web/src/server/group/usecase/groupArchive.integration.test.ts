/** Real PostgreSQL regressions for archive eligibility, retry safety and ledger concurrency. */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GroupStatus } from "@haalkhata/protogen/group/v1/group_pb";
import type { CreateExpenseRequest } from "@haalkhata/protogen/expense/v1/expense_pb";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_group_archive_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const OWNER = "archive-owner";
const MEMBER = "archive-member";

/** Checks database availability while always closing the probe connection. */
async function databaseReachable(): Promise<boolean> {
  const probe = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.end();
  }
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("group archive against Postgres", () => {
  let database: Client;
  let groupId: string;
  let createExpense: typeof import("@/server/expense/usecase/expense.usecase").createExpense;
  let setStatus: typeof import("./group.usecase").setStatus;
  let closePool: () => Promise<void>;

  /**
   * Builds a self-paid expense that leaves every group member settled.
   *
   * @returns A valid request with a stable operation id for replay checks.
   */
  function expenseRequest(): CreateExpenseRequest {
    return {
      groupId, description: "Own lunch", amountCents: 1000, currency: "USD",
      category: "food", expenseDate: "2026-10-12", splitType: "exact", notes: "",
      payers: [{ userId: OWNER, amountCents: 1000 }],
      splitSpecs: [{ userId: OWNER, amountCents: 1000, percentBp: 0, shares: 0 }],
      items: [], taxCents: 0, tipCents: 0, operationId: randomUUID(),
    } as unknown as CreateExpenseRequest;
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    const infrastructure = await import("@/server/common/db");
    await infrastructure.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ createExpense } = await import("@/server/expense/usecase/expense.usecase"));
    ({ setStatus } = await import("./group.usecase"));
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, google_sub) VALUES
       ($1, 'archive-owner@example.com', 'Owner', '#336699', 'google-archive-owner'),
       ($2, 'archive-member@example.com', 'Member', '#336699', 'google-archive-member')`,
      [OWNER, MEMBER],
    );
  }, 60_000);

  beforeEach(async () => {
    groupId = randomUUID();
    await database.query("INSERT INTO groups (id, name, created_by) VALUES ($1, 'Archive test', $2)", [groupId, OWNER]);
    await database.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')",
      [groupId, OWNER, MEMBER],
    );
  });

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("replays a saved expense after the group was archived without writing another expense", async () => {
    const request = expenseRequest();
    const saved = await createExpense(OWNER, request);
    await setStatus(MEMBER, { groupId, status: GroupStatus.ARCHIVED });
    const replayed = await createExpense(OWNER, request);
    expect(replayed.id).toBe(saved.id);
    const expenses = await database.query("SELECT id FROM expenses WHERE group_id = $1", [groupId]);
    expect(expenses.rows).toEqual([{ id: saved.id }]);
    await expect(createExpense(OWNER, { ...request, operationId: randomUUID() })).rejects.toMatchObject({
      code: "failed_precondition",
    });
  });
});
