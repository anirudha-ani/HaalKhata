/**
 * Integration test for paying back one expense from its page, against a real
 * Postgres: what the page offers, what the payment accepts, that the two
 * agree, and that the database keeps a payment for an expense in that
 * expense's balance.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { testDatabaseName } from "@/server/common/testing/testDatabase";
import { REPAYMENT_REFUSALS } from "@/server/expense/expense.constants";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_repayment_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const ANA_ID = "ana";
const BOB_ID = "bob";
const CHEN_ID = "chen";
const DANA_ID = "dana";
const TRIP_ID = "trip";
const FLAT_ID = "flat";
const LOOP_ID = "loop";
const CAMP_ID = "camp";

/**
 * Checks whether the admin database accepts a connection.
 *
 * @returns True when the suite can run.
 */
async function databaseReachable(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("paying back one expense against Postgres", () => {
  let database: Client;
  let expenses: typeof import("../expense.usecase");
  let balances: typeof import("../balance.usecase");
  let closePool: () => Promise<void>;
  let operation = 0;

  /**
   * Stores an expense directly: who paid, and whose share is what.
   *
   * @param expense - The expense.
   * @param expense.id - Its id.
   * @param expense.groupId - Its group, or null for one outside groups.
   * @param expense.description - Its name.
   * @param expense.currency - Its currency.
   * @param expense.payers - Who paid what, in cents.
   * @param expense.splits - Whose share is what, in cents.
   */
  async function storeExpense(expense: {
    id: string;
    groupId: string | null;
    description: string;
    currency?: string;
    payers: Record<string, number>;
    splits: Record<string, number>;
  }): Promise<void> {
    const total = Object.values(expense.payers).reduce((running, cents) => running + cents, 0);
    await database.query(
      `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
       VALUES ($1, $2, $3, $4, $5, '2026-11-01', 'exact', $6)`,
      [expense.id, expense.groupId, expense.description, total, expense.currency ?? "USD", Object.keys(expense.payers)[0]],
    );
    for (const [userId, cents] of Object.entries(expense.payers)) {
      await database.query(
        `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, $3)`,
        [expense.id, userId, cents],
      );
    }
    for (const [userId, cents] of Object.entries(expense.splits)) {
      await database.query(
        `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, $3)`,
        [expense.id, userId, cents],
      );
    }
  }

  /**
   * A payment for an expense, as its page's dialog sends it.
   *
   * @param payerId - Who pays.
   * @param recipientId - Who is paid.
   * @param expenseId - The expense it pays back.
   * @param scopeId - The balance the dialog names: a group id, or "".
   * @param amountCents - How much.
   * @returns The arguments to recordSettlement.
   */
  function payBack(payerId: string, recipientId: string, expenseId: string, scopeId: string, amountCents: number) {
    operation += 1;
    return [
      payerId,
      {
        groupId: "",
        toUserId: recipientId,
        amountCents,
        currency: "USD",
        method: "cash",
        note: "",
        scopeGroupIds: [scopeId],
        operationId: `00000000-0000-4000-8000-${String(operation).padStart(12, "0")}`,
        expenseId,
      },
    ] as Parameters<typeof expenses.recordSettlement>;
  }

  /**
   * What the reader owes the one person they owe on an expense, as its page reads it.
   *
   * @param readerId - Who reads the page.
   * @param expenseId - The expense.
   * @returns The single repayment on the page.
   */
  async function repaymentOn(readerId: string, expenseId: string) {
    const detail = await expenses.getExpense(readerId, expenseId);
    expect(detail.repayments).toHaveLength(1);
    return detail.repayments[0];
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    // Set before importing db.ts, which reads DATABASE_URL when it first
    // builds the pool.
    process.env.DATABASE_URL = TEST_URL;
    const dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    expenses = await import("../expense.usecase");
    balances = await import("../balance.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub) VALUES
         ($1, 'ana@example.com', 'Ana Alvarez', '#c73e2e', now(), 'google-ana'),
         ($2, 'bob@example.com', 'Bob Brown', '#0f8a5f', now(), 'google-bob'),
         ($3, 'chen@example.com', 'Chen Chow', '#336699', now(), 'google-chen'),
         ($4, 'dana@example.com', 'Dana Diaz', '#996633', now(), 'google-dana')`,
      [ANA_ID, BOB_ID, CHEN_ID, DANA_ID],
    );
    await database.query(
      `INSERT INTO groups (id, name, created_by) VALUES ($1, 'Trip', $4), ($2, 'Flat', $4), ($3, 'Loop', $4)`,
      [TRIP_ID, FLAT_ID, LOOP_ID, ANA_ID],
    );
    await database.query(`UPDATE groups SET simplify_debts = true WHERE id = $1`, [FLAT_ID]);
    await database.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES
         ($1, $4, 'owner'), ($1, $5, 'member'), ($1, $6, 'member'),
         ($2, $4, 'owner'), ($2, $5, 'member'), ($2, $6, 'member'),
         ($3, $4, 'owner'), ($3, $5, 'member'), ($3, $6, 'member')`,
      [TRIP_ID, FLAT_ID, LOOP_ID, ANA_ID, BOB_ID, CHEN_ID],
    );
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("offers each ower their share, and nothing to the person who paid", async () => {
    await storeExpense({
      id: "dinner",
      groupId: TRIP_ID,
      description: "Dinner",
      payers: { [ANA_ID]: 3000 },
      splits: { [ANA_ID]: 1000, [BOB_ID]: 1000, [CHEN_ID]: 1000 },
    });
    expect(await repaymentOn(BOB_ID, "dinner")).toEqual({
      userId: ANA_ID,
      owedCents: 1000,
      paidCents: 0,
      payableCents: 1000,
      refusal: "",
    });
    expect((await expenses.getExpense(ANA_ID, "dinner")).repayments).toEqual([]);
  });

  it("records a part payment against the expense, in its group, and offers the rest", async () => {
    await expenses.recordSettlement(...payBack(BOB_ID, ANA_ID, "dinner", TRIP_ID, 400));
    const { rows } = await database.query(
      `SELECT group_id, from_user, to_user, amount_cents, expense_id FROM settlements`,
    );
    expect(rows).toEqual([
      { group_id: TRIP_ID, from_user: BOB_ID, to_user: ANA_ID, amount_cents: 400, expense_id: "dinner" },
    ]);
    expect(await repaymentOn(BOB_ID, "dinner")).toMatchObject({ paidCents: 400, payableCents: 600 });
    // The group balance moved like any payment's.
    expect(await balances.amountOwed(BOB_ID, ANA_ID, TRIP_ID, "USD")).toBe(600);
  });

  it("refuses more than is left, with the figure", async () => {
    await expect(expenses.recordSettlement(...payBack(BOB_ID, ANA_ID, "dinner", TRIP_ID, 700))).rejects.toMatchObject({
      code: "invalid_argument",
      message: "that's more than the $6.00 left to pay for this bill",
    });
  });

  it("shows the payment to the two people on it and nobody else", async () => {
    const forBob = await expenses.getExpense(BOB_ID, "dinner");
    const forAna = await expenses.getExpense(ANA_ID, "dinner");
    const forChen = await expenses.getExpense(CHEN_ID, "dinner");
    expect(forBob.payments.map((payment) => payment.amountCents)).toEqual([400]);
    expect(forAna.payments.map((payment) => payment.expenseId)).toEqual(["dinner"]);
    expect(forChen.payments).toEqual([]);
  });

  it("marks the expense paid back once the rest is paid, on the page and in the list", async () => {
    await expenses.recordSettlement(...payBack(BOB_ID, ANA_ID, "dinner", TRIP_ID, 600));
    expect(await repaymentOn(BOB_ID, "dinner")).toEqual({
      userId: ANA_ID,
      owedCents: 1000,
      paidCents: 1000,
      payableCents: 0,
      refusal: "",
    });
    const bobsList = await expenses.listExpenses(BOB_ID, { groupId: TRIP_ID }, { cursor: "", limit: 20 });
    expect(bobsList.repaidExpenseIds).toEqual(["dinner"]);
    // Chen owes the same and has paid nothing.
    const chensList = await expenses.listExpenses(CHEN_ID, { groupId: TRIP_ID }, { cursor: "", limit: 20 });
    expect(chensList.repaidExpenseIds).toEqual([]);
    await expect(expenses.recordSettlement(...payBack(BOB_ID, ANA_ID, "dinner", TRIP_ID, 100))).rejects.toMatchObject({
      message: "you have already paid this expense back",
    });
  });

  it("names the expense on both people's statements", async () => {
    const forBob = await balances.getFriendLedger(BOB_ID, ANA_ID);
    const forAna = await balances.getFriendLedger(ANA_ID, BOB_ID);
    const payments = (entries: { kind: string; description: string }[]) =>
      entries.filter((entry) => entry.kind === "settlement").map((entry) => entry.description);
    expect(payments(forBob.entries)).toEqual(['You paid back "Dinner"', 'You paid back "Dinner"']);
    expect(payments(forAna.entries)).toEqual([
      'Bob Brown paid you back for "Dinner"',
      'Bob Brown paid you back for "Dinner"',
    ]);
  });

  it("offers the share again when a payment for it is removed", async () => {
    const { rows } = await database.query<{ id: string }>(
      `SELECT id FROM settlements WHERE expense_id = 'dinner' AND amount_cents = 600`,
    );
    await expenses.deleteSettlement(ANA_ID, rows[0].id);
    expect(await repaymentOn(BOB_ID, "dinner")).toMatchObject({ paidCents: 400, payableCents: 600 });
    const notice = await database.query(
      `SELECT body, link FROM notifications WHERE user_id = $1 AND type = 'settlement_deleted'`,
      [BOB_ID],
    );
    expect(notice.rows).toEqual([
      { body: 'Removed $6.00 payment from you for "Dinner" · Trip · Balances restored', link: "/expenses/dinner" },
    ]);
  });

  it("offers no more than the balance holds when other expenses even part of it out", async () => {
    // Bob owes Ana 20 for lunch, but Ana owes Bob 10 for a taxi in the same
    // group: only 10 can be paid in it, on top of the 6 still open on dinner.
    await storeExpense({
      id: "taxi",
      groupId: TRIP_ID,
      description: "Taxi",
      payers: { [BOB_ID]: 1000 },
      splits: { [ANA_ID]: 1000 },
    });
    await storeExpense({
      id: "lunch",
      groupId: TRIP_ID,
      description: "Lunch",
      payers: { [ANA_ID]: 2000 },
      splits: { [BOB_ID]: 2000 },
    });
    expect(await balances.amountOwed(BOB_ID, ANA_ID, TRIP_ID, "USD")).toBe(1600);
    expect(await repaymentOn(BOB_ID, "lunch")).toMatchObject({ owedCents: 2000, payableCents: 1600 });
    await expect(expenses.recordSettlement(...payBack(BOB_ID, ANA_ID, "lunch", TRIP_ID, 2000))).rejects.toMatchObject({
      message: "that's more than the $16.00 left to pay for this bill",
    });
    await expenses.recordSettlement(...payBack(BOB_ID, ANA_ID, "lunch", TRIP_ID, 1600));
    // Square in the group with 4 of lunch unpaid: nothing to pay, and nothing refused.
    expect(await repaymentOn(BOB_ID, "lunch")).toEqual({
      userId: ANA_ID,
      owedCents: 2000,
      paidCents: 1600,
      payableCents: 0,
      refusal: "",
    });
    expect(await repaymentOn(BOB_ID, "dinner")).toMatchObject({ payableCents: 0, refusal: "" });
    await expect(expenses.recordSettlement(...payBack(BOB_ID, ANA_ID, "lunch", TRIP_ID, 100))).rejects.toMatchObject({
      message: "you don't owe this person anything where this expense is any more",
    });
  });

  it("keeps a payment for an expense in that expense's balance", async () => {
    await storeExpense({
      id: "museum",
      groupId: TRIP_ID,
      description: "Museum",
      payers: { [ANA_ID]: 1000 },
      splits: { [CHEN_ID]: 1000 },
    });
    await expect(expenses.recordSettlement(...payBack(CHEN_ID, ANA_ID, "museum", "", 500))).rejects.toMatchObject({
      message: "a payment for an expense is recorded in that expense's balance",
    });
    const [payerId, request] = payBack(CHEN_ID, ANA_ID, "museum", TRIP_ID, 500);
    await expect(expenses.recordSettlement(payerId, { ...request, currency: "EUR" })).rejects.toMatchObject({
      message: "this expense is in USD, not EUR",
    });
    await expect(
      expenses.recordSettlement(payerId, { ...request, scopeGroupIds: [], netAcrossScopes: true, positionDigest: "x" }),
    ).rejects.toMatchObject({ message: "a payment for an expense cannot also settle everything with this person" });
    await expect(expenses.recordSettlement(payerId, { ...request, received: true })).rejects.toMatchObject({
      message: "a payment for an expense is recorded by whoever paid it",
    });
    // Named the other way a single balance can be, it is accepted.
    await expenses.recordSettlement(payerId, { ...request, groupId: TRIP_ID, scopeGroupIds: [] });
    expect(await repaymentOn(CHEN_ID, "museum")).toMatchObject({ paidCents: 500, payableCents: 500 });
  });

  it("refuses, in the database, a payment for an expense outside its group or currency", async () => {
    const insert = (groupId: string | null, currency: string) =>
      database.query(
        `INSERT INTO settlements (id, group_id, from_user, to_user, amount_cents, currency, recorded_by, expense_id)
         VALUES (gen_random_uuid()::text, $1, $2, $3, 100, $4, $2, 'museum')`,
        [groupId, CHEN_ID, ANA_ID, currency],
      );
    await expect(insert(null, "USD")).rejects.toMatchObject({ code: "23514" });
    await expect(insert(FLAT_ID, "USD")).rejects.toMatchObject({ code: "23514" });
    await expect(insert(TRIP_ID, "EUR")).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses anybody who owes the recipient nothing on the expense", async () => {
    await expect(expenses.recordSettlement(...payBack(CHEN_ID, BOB_ID, "museum", TRIP_ID, 100))).rejects.toMatchObject({
      message: "you don't owe this person anything on this expense",
    });
  });

  it("pays back an expense outside groups in the pair's own balance", async () => {
    await storeExpense({
      id: "cinema",
      groupId: null,
      description: "Cinema",
      payers: { [DANA_ID]: 2400 },
      splits: { [DANA_ID]: 1200, [BOB_ID]: 1200 },
    });
    expect(await repaymentOn(BOB_ID, "cinema")).toMatchObject({ userId: DANA_ID, payableCents: 1200 });
    await expenses.recordSettlement(...payBack(BOB_ID, DANA_ID, "cinema", "", 1200));
    const { rows } = await database.query(
      `SELECT group_id, amount_cents FROM settlements WHERE expense_id = 'cinema'`,
    );
    expect(rows).toEqual([{ group_id: null, amount_cents: 1200 }]);
    expect(await repaymentOn(BOB_ID, "cinema")).toMatchObject({ paidCents: 1200, payableCents: 0 });
    const notice = await database.query(
      `SELECT body, link FROM notifications WHERE user_id = $1 AND type = 'settlement'`,
      [DANA_ID],
    );
    expect(notice.rows).toEqual([
      { body: 'Recorded $12.00 to you for "Cinema" · One-off expenses', link: "/expenses/cinema" },
    ]);
  });

  it("sends a simplified group's debt to the group's page when it is routed elsewhere", async () => {
    // Bob owes Ana 10 for groceries, Ana owes Chen 10 for gas: the group
    // routes Bob's 10 straight to Chen, so Bob owes Ana nothing there.
    await storeExpense({
      id: "groceries",
      groupId: FLAT_ID,
      description: "Groceries",
      payers: { [ANA_ID]: 1000 },
      splits: { [BOB_ID]: 1000 },
    });
    await storeExpense({
      id: "gas",
      groupId: FLAT_ID,
      description: "Gas",
      payers: { [CHEN_ID]: 1000 },
      splits: { [ANA_ID]: 1000 },
    });
    expect(await repaymentOn(BOB_ID, "groceries")).toMatchObject({
      payableCents: 0,
      refusal: REPAYMENT_REFUSALS.simplified,
    });
    await expect(expenses.recordSettlement(...payBack(BOB_ID, ANA_ID, "groceries", FLAT_ID, 500))).rejects.toMatchObject({
      message: REPAYMENT_REFUSALS.simplified,
    });
  });

  it("waits for a live split to end", async () => {
    await storeExpense({
      id: "brunch",
      groupId: TRIP_ID,
      description: "Brunch",
      payers: { [ANA_ID]: 2000 },
      splits: { [ANA_ID]: 1000, [CHEN_ID]: 1000 },
    });
    const { startLiveSplit } = await import("../liveSplit/liveSplit.usecase");
    await startLiveSplit(ANA_ID, "brunch");
    expect(await repaymentOn(CHEN_ID, "brunch")).toMatchObject({ payableCents: 0, refusal: REPAYMENT_REFUSALS.liveSplit });
    await expect(expenses.recordSettlement(...payBack(CHEN_ID, ANA_ID, "brunch", TRIP_ID, 500))).rejects.toMatchObject({
      message: REPAYMENT_REFUSALS.liveSplit,
    });
  });

  it("refuses in an archived group, and offers nothing on a deleted expense", async () => {
    await database.query(`UPDATE groups SET status = 'archived' WHERE id = $1`, [TRIP_ID]);
    expect(await repaymentOn(CHEN_ID, "museum")).toMatchObject({ payableCents: 0, refusal: REPAYMENT_REFUSALS.archived });
    await database.query(`UPDATE groups SET status = 'active' WHERE id = $1`, [TRIP_ID]);
    await database.query(`UPDATE expenses SET deleted_at = now(), deleted_by = $1 WHERE id = 'museum'`, [ANA_ID]);
    expect((await expenses.getExpense(CHEN_ID, "museum")).repayments).toEqual([]);
    await expect(expenses.recordSettlement(...payBack(CHEN_ID, ANA_ID, "museum", TRIP_ID, 100))).rejects.toMatchObject({
      message: "this expense was deleted, so there is nothing to pay back",
    });
  });

  it("calls a bill square, not refused, once its group was settled and then left or archived", async () => {
    // Leaving and archiving both need the balance settled first, so neither
    // can leave anything to pay: the bill says square, not "unarchive it".
    await database.query(`INSERT INTO groups (id, name, created_by) VALUES ($1, 'Camp', $2)`, [CAMP_ID, ANA_ID]);
    await database.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`,
      [CAMP_ID, ANA_ID, BOB_ID, CHEN_ID],
    );
    await storeExpense({
      id: "campsite",
      groupId: CAMP_ID,
      description: "Campsite",
      payers: { [ANA_ID]: 2000 },
      splits: { [ANA_ID]: 1000, [BOB_ID]: 1000 },
    });
    await storeExpense({
      id: "firewood",
      groupId: CAMP_ID,
      description: "Firewood",
      payers: { [CHEN_ID]: 2000 },
      splits: { [BOB_ID]: 1000, [CHEN_ID]: 1000 },
    });
    const groups = await import("@/server/group/usecase/group.usecase");
    const { GroupStatus } = await import("@haalkhata/protogen/group/v1/group_pb");
    /**
     * Settles what Bob owes someone in Camp the ordinary way, from the group's page.
     *
     * @param recipientId - Who Bob pays.
     */
    const settleCamp = async (recipientId: string) => {
      const [, request] = payBack(BOB_ID, recipientId, "", CAMP_ID, 1000);
      await expenses.recordSettlement(BOB_ID, request);
    };

    await settleCamp(CHEN_ID);
    await groups.removeMemberFromGroup(CHEN_ID, { groupId: CAMP_ID, userId: CHEN_ID });
    expect(await repaymentOn(BOB_ID, "firewood")).toMatchObject({ owedCents: 1000, payableCents: 0, refusal: "" });

    await settleCamp(ANA_ID);
    await groups.setStatus(ANA_ID, { groupId: CAMP_ID, status: GroupStatus.ARCHIVED });
    expect(await repaymentOn(BOB_ID, "campsite")).toMatchObject({ owedCents: 1000, payableCents: 0, refusal: "" });
    await expect(expenses.recordSettlement(...payBack(BOB_ID, ANA_ID, "campsite", CAMP_ID, 100))).rejects.toMatchObject({
      message: "you don't owe this person anything where this expense is any more",
    });
  });

  it("records one payment once when the same share is paid twice at the same moment", async () => {
    await storeExpense({
      id: "parking",
      groupId: null,
      description: "Parking",
      payers: { [DANA_ID]: 2000 },
      splits: { [BOB_ID]: 2000 },
    });
    // Two taps on two devices: different attempts, both for the whole share.
    const outcomes = await Promise.allSettled([
      expenses.recordSettlement(...payBack(BOB_ID, DANA_ID, "parking", "", 2000)),
      expenses.recordSettlement(...payBack(BOB_ID, DANA_ID, "parking", "", 2000)),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
      reason: { message: "you have already paid this expense back" },
    });
    const { rows } = await database.query(`SELECT amount_cents FROM settlements WHERE expense_id = 'parking'`);
    expect(rows).toEqual([{ amount_cents: 2000 }]);
  });

  it("says so when a group's debts cancel out around a loop", async () => {
    // Ana covered Bob, Bob covered Chen, Chen covered Ana: everyone's net is
    // zero, so no payment along the loop is accepted.
    await storeExpense({ id: "loop-1", groupId: LOOP_ID, description: "Bread", payers: { [ANA_ID]: 1000 }, splits: { [BOB_ID]: 1000 } });
    await storeExpense({ id: "loop-2", groupId: LOOP_ID, description: "Milk", payers: { [BOB_ID]: 1000 }, splits: { [CHEN_ID]: 1000 } });
    await storeExpense({ id: "loop-3", groupId: LOOP_ID, description: "Eggs", payers: { [CHEN_ID]: 1000 }, splits: { [ANA_ID]: 1000 } });
    expect(await repaymentOn(BOB_ID, "loop-1")).toMatchObject({ payableCents: 0, refusal: REPAYMENT_REFUSALS.loop });
    await expect(expenses.recordSettlement(...payBack(BOB_ID, ANA_ID, "loop-1", LOOP_ID, 500))).rejects.toMatchObject({
      message: REPAYMENT_REFUSALS.loop,
    });
  });

  it("reads every balance the expense page reads exactly as the ledger does", async () => {
    // The page reads one balance without the group's whole history; the
    // payment's own guard reads it from the whole history. Every pair, both
    // ways, in every scope this suite built, must agree.
    const { snapshot } = await import("@/server/common/db/db");
    const { findGroupById } = await import("@/server/group/repo/groups.repo");
    const people = [ANA_ID, BOB_ID, CHEN_ID, DANA_ID];
    await snapshot(async (client) => {
      for (const scopeId of [TRIP_ID, FLAT_ID, LOOP_ID, ""]) {
        const group = scopeId ? ((await findGroupById(scopeId, client)) ?? null) : null;
        for (const debtorId of people) {
          for (const creditorId of people) {
            if (debtorId === creditorId) continue;
            if (group && (debtorId === DANA_ID || creditorId === DANA_ID)) continue;
            const owing = await balances.owingInScope(debtorId, creditorId, group, "USD", client);
            const ledger = (await balances.owedByScope(debtorId, creditorId, client)).find(
              (scope) => (scope.groupId ?? "") === scopeId && scope.currency === "USD",
            );
            expect({ scopeId, debtorId, creditorId, owed: owing.owedCents }).toEqual({
              scopeId,
              debtorId,
              creditorId,
              owed: ledger?.owedCents ?? 0,
            });
          }
        }
      }
    });
  });
});
