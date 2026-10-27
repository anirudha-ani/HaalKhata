/**
 * Real PostgreSQL regressions for audit B08: in a group that does not
 * simplify debts, a member whose total is zero can still owe one person and
 * be owed by another. Once they left, neither debt could be paid (a group
 * payment needs both people to be members) and the group could never be
 * archived, so leaving waits until no debt names them.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_pairwise_leave_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const ANA_ID = "leave-ana";
const BEN_ID = "leave-ben";
const DEV_ID = "leave-dev";

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

const reachable = await databaseReachable();

describe.skipIf(!reachable)("leaving a group whose debts run person to person", () => {
  let database: Client;
  let groupId: string;
  let expenses: typeof import("@/server/expense/usecase/expense.usecase");
  let balances: typeof import("@/server/expense/usecase/balance.usecase");
  let groups: typeof import("./group.usecase");
  let closePool: () => Promise<void>;

  /**
   * One person pays a whole dollar expense for another, through the real usecase.
   *
   * @param payer - Who paid.
   * @param ower - Who owes all of it.
   * @param amountCents - How much.
   */
  async function paidFor(payer: string, ower: string, amountCents: number) {
    await expenses.createExpense(payer, {
      groupId,
      description: "Shared",
      amountCents,
      currency: "USD",
      category: "food",
      expenseDate: "2026-10-20",
      splitType: "exact",
      notes: "",
      payers: [{ userId: payer, amountCents }],
      splitSpecs: [{ userId: ower, amountCents, percentBp: 0, shares: 0 }],
      items: [],
      taxCents: 0,
      tipCents: 0,
    } as never);
  }

  /**
   * Records a payment between two members in the group.
   *
   * @param payer - Who paid, recording it.
   * @param recipient - Who was paid.
   * @param amountCents - How much.
   */
  async function recordPayment(payer: string, recipient: string, amountCents: number) {
    await expenses.recordSettlement(payer, {
      groupId,
      toUserId: recipient,
      amountCents,
      currency: "USD",
      method: "cash",
      note: "",
    });
  }

  /** @returns The group's member ids, sorted. */
  async function memberIds(): Promise<string[]> {
    const { rows } = await database.query<{ user_id: string }>(
      "SELECT user_id FROM group_members WHERE group_id = $1 ORDER BY user_id",
      [groupId],
    );
    return rows.map((memberRow) => memberRow.user_id);
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
    expenses = await import("@/server/expense/usecase/expense.usecase");
    balances = await import("@/server/expense/usecase/balance.usecase");
    groups = await import("./group.usecase");
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
       VALUES ($1, 'ana@example.com', 'Ana', '#c73e2e', now(), 'google-ana'),
              ($2, 'ben@example.com', 'Ben', '#0f8a5f', now(), 'google-ben'),
              ($3, 'dev@example.com', 'Dev', '#336699', now(), 'google-dev')`,
      [ANA_ID, BEN_ID, DEV_ID],
    );
  }, 60_000);

  beforeEach(async () => {
    await database.query("TRUNCATE groups, expenses, settlements, activity, notifications, operations CASCADE");
    groupId = randomUUID();
    await database.query(
      "INSERT INTO groups (id, name, created_by, currency, simplify_debts) VALUES ($1, 'Trip', $2, 'USD', false)",
      [groupId, ANA_ID],
    );
    await database.query(
      `INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`,
      [groupId, ANA_ID, BEN_ID, DEV_ID],
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

  it("keeps Dev in while Ben owes him and he owes Ana, though his total is zero", async () => {
    await paidFor(DEV_ID, BEN_ID, 5000);
    await paidFor(ANA_ID, DEV_ID, 5000);
    expect(await balances.userNetInGroup(DEV_ID, groupId)).toEqual(new Map());

    await expect(groups.removeMemberFromGroup(DEV_ID, { groupId, userId: DEV_ID })).rejects.toMatchObject({
      code: "invalid_argument",
    });
    await expect(groups.removeMemberFromGroup(ANA_ID, { groupId, userId: DEV_ID })).rejects.toMatchObject({
      code: "invalid_argument",
    });
    expect(await memberIds()).toEqual([ANA_ID, BEN_ID, DEV_ID].sort());
  });

  it("lets Dev go once both debts are paid", async () => {
    await paidFor(DEV_ID, BEN_ID, 5000);
    await paidFor(ANA_ID, DEV_ID, 5000);
    await recordPayment(BEN_ID, DEV_ID, 5000);
    await recordPayment(DEV_ID, ANA_ID, 5000);

    await groups.removeMemberFromGroup(DEV_ID, { groupId, userId: DEV_ID });
    expect(await memberIds()).toEqual([ANA_ID, BEN_ID].sort());
  });

  it("lets Dev go once Simplify debts routes Ben's payment to Ana directly", async () => {
    await paidFor(DEV_ID, BEN_ID, 5000);
    await paidFor(ANA_ID, DEV_ID, 5000);
    await groups.setSimplifyDebts(ANA_ID, { groupId, simplify: true });

    await groups.removeMemberFromGroup(DEV_ID, { groupId, userId: DEV_ID });
    const after = await balances.getGroupBalances(ANA_ID, groupId);
    expect(after.simplified).toEqual([{ fromUserId: BEN_ID, toUserId: ANA_ID, amountCents: 5000 }]);
  });

  it("does not hold anyone in for a loop that cancels out", async () => {
    // Ben owes Ana, Dev owes Ben, Ana owes Dev, the same each way: no one
    // owes anyone overall, and a payment along the loop is refused anyway.
    await paidFor(ANA_ID, BEN_ID, 1000);
    await paidFor(BEN_ID, DEV_ID, 1000);
    await paidFor(DEV_ID, ANA_ID, 1000);

    await groups.removeMemberFromGroup(DEV_ID, { groupId, userId: DEV_ID });
    expect(await memberIds()).toEqual([ANA_ID, BEN_ID].sort());
  });
});
