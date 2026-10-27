/**
 * Real PostgreSQL regression for audit A13: an edit that takes somebody off
 * an expense changes their balance, so they must hear about it, with a line
 * saying what they no longer owe or get back, and a link they can open.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreateExpenseRequest } from "@haalkhata/protogen/expense/v1/expense_pb";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_edit_removes_participant_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const RAHIM = "edit-rahim";
const SARA = "edit-sara";
const TOMAS = "edit-tomas";

/**
 * Checks database availability while always closing the probe connection.
 * @returns Whether the isolated PostgreSQL suite can run.
 */
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

/**
 * A 60.00 bill split evenly between two people, paid by one of them.
 *
 * @param groupId - The group, or "" for a one-off expense.
 * @param payerId - Who paid the whole bill.
 * @param otherId - Who shares it with them.
 * @returns A create (or full replacement) request.
 */
function billRequest(groupId: string, payerId: string, otherId: string): CreateExpenseRequest {
  return {
    groupId, description: "Electricity", amountCents: 6000, currency: "USD",
    category: "utilities", expenseDate: "2026-10-20", splitType: "exact", notes: "",
    payers: [{ userId: payerId, amountCents: 6000 }],
    splitSpecs: [payerId, otherId].map((userId) => ({ userId, amountCents: 3000, percentBp: 0, shares: 0 })),
    items: [], taxCents: 0, tipCents: 0, operationId: randomUUID(),
  } as unknown as CreateExpenseRequest;
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("editing somebody off an expense", () => {
  let database: Client;
  let groupId: string;
  let createExpense: typeof import("./expense.usecase").createExpense;
  let updateExpense: typeof import("./expense.usecase").updateExpense;
  let closePool: () => Promise<void>;

  /**
   * The bell rows an edit left for one person.
   * @param userId - Whose notifications.
   * @returns Body and link of each expense_updated notification.
   */
  async function updateNotices(userId: string) {
    const { rows } = await database.query(
      "SELECT body, link FROM notifications WHERE user_id = $1 AND type = 'expense_updated'",
      [userId],
    );
    return rows;
  }

  /**
   * Whether the edit's feed line is in someone's feed.
   * @param userId - Whose feed.
   * @returns True when the expense_updated line names them in its audience.
   */
  async function seesFeedLine(userId: string): Promise<boolean> {
    const { rows } = await database.query(
      "SELECT 1 FROM activity WHERE type = 'expense_updated' AND audience @> jsonb_build_array($1::text)",
      [userId],
    );
    return rows.length === 1;
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("@/server/common/db/db")).ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ createExpense, updateExpense } = await import("./expense.usecase"));
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, google_sub) VALUES
       ($1, 'edit-rahim@example.com', 'Rahim', '#336699', 'google-edit-rahim'),
       ($2, 'edit-sara@example.com', 'Sara', '#336699', 'google-edit-sara'),
       ($3, 'edit-tomas@example.com', 'Tomas', '#336699', 'google-edit-tomas')`,
      [RAHIM, SARA, TOMAS],
    );
    await database.query(
      `INSERT INTO friendships (user_id, friend_id) VALUES
       ($1, $2), ($2, $1), ($1, $3), ($3, $1), ($2, $3), ($3, $2)`,
      [RAHIM, SARA, TOMAS],
    );
  }, 60_000);

  beforeEach(async () => {
    await database.query("TRUNCATE groups, expenses, settlements, activity, notifications, operations CASCADE");
    groupId = randomUUID();
    await database.query("INSERT INTO groups (id, name, created_by) VALUES ($1, 'Flat 4B', $2)", [groupId, RAHIM]);
    await database.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')",
      [groupId, RAHIM, SARA, TOMAS],
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

  it("tells a group member taken off the expense what they no longer get back", async () => {
    // Sara paid; Rahim corrects it to Tomas.
    const bill = await createExpense(SARA, billRequest(groupId, SARA, RAHIM));

    await updateExpense(RAHIM, bill.id, billRequest(groupId, TOMAS, RAHIM));

    expect(await updateNotices(SARA)).toEqual([
      {
        body: "Flat 4B · you're no longer on it, so you no longer get back $30.00",
        link: `/expenses/${bill.id}`,
      },
    ]);
    expect(await seesFeedLine(SARA)).toBe(true);
    expect(await updateNotices(TOMAS)).toEqual([
      { body: "Flat 4B · now you get back $30.00", link: `/expenses/${bill.id}` },
    ]);
  });

  it("tells somebody taken off a one-off expense, linking where they can still look", async () => {
    // Rahim paid and split it with Sara; he corrects it to Tomas.
    const bill = await createExpense(RAHIM, billRequest("", RAHIM, SARA));

    await updateExpense(RAHIM, bill.id, billRequest("", RAHIM, TOMAS));

    // Off a one-off expense Sara can no longer open it, so the link goes to
    // her page with Rahim instead, and the feed line (one link for
    // everyone) stays with the people still on it.
    expect(await updateNotices(SARA)).toEqual([
      {
        body: "One-off expense · you're no longer on it, so you no longer owe Rahim $30.00",
        link: `/friends/${RAHIM}`,
      },
    ]);
    expect(await seesFeedLine(SARA)).toBe(false);
    expect(await seesFeedLine(TOMAS)).toBe(true);
  });

  it("leaves people who stay on the expense with their usual line", async () => {
    const bill = await createExpense(SARA, billRequest(groupId, SARA, RAHIM));

    await updateExpense(SARA, bill.id, { ...billRequest(groupId, SARA, RAHIM), description: "Electricity bill" } as CreateExpenseRequest);

    expect(await updateNotices(RAHIM)).toEqual([
      { body: "Flat 4B · now you owe Sara $30.00", link: `/expenses/${bill.id}` },
    ]);
    expect(await updateNotices(TOMAS)).toEqual([]);
  });
});
