/**
 * Integration test for settlement scoping and the pair lock, against a real
 * Postgres.
 *
 * The unit tests prove the decision tree with mocks; none of them can prove
 * the property the production incident violated: that one real-world payment
 * can be recorded at most once, whichever pages it is recorded from and
 * however simultaneously. That takes the actual advisory lock on an actual
 * database, so this suite replays the incident — a debt living in a group,
 * settled from the friends tab and the group page at the same moment — and
 * checks what the settlements table really contains afterwards.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_settlement_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const DEBTOR = "debtor-1";
const CREDITOR = "creditor-1";

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

/**
 * Seeds the incident's shape: one group, two members, one expense paid by the
 * creditor and owed by the debtor — a debt of 5000 cents living only in the
 * group's scope.
 *
 * @param database - Connected client on the test database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, onboarded_at)
     VALUES ($1, 'debtor@example.com', 'Debbie Debtor', '#c73e2e', now()),
            ($2, 'creditor@example.com', 'Carl Creditor', '#0f8a5f', now())`,
    [DEBTOR, CREDITOR],
  );
  await database.query(`INSERT INTO groups (id, name, created_by) VALUES ('grp-1', 'Trip', $1)`, [
    CREDITOR,
  ]);
  await database.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES
       ('grp-1', $1, 'member'), ('grp-1', $2, 'owner')`,
    [DEBTOR, CREDITOR],
  );
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ('exp-1', 'grp-1', 'Campsite', 10000, 'USD', '2026-07-28', 'equal', $1)`,
    [CREDITOR],
  );
  await database.query(
    `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ('exp-1', $1, 10000)`,
    [CREDITOR],
  );
  await database.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES
       ('exp-1', $1, 5000), ('exp-1', $2, 5000)`,
    [DEBTOR, CREDITOR],
  );
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("recordSettlement against Postgres", () => {
  let database: Client;
  let recordSettlement: typeof import("./expense.usecase").recordSettlement;
  let createExpense: typeof import("./expense.usecase").createExpense;
  let deleteExpense: typeof import("./expense.usecase").deleteExpense;
  let deleteSettlement: typeof import("./expense.usecase").deleteSettlement;
  let getExpense: typeof import("./expense.usecase").getExpense;
  let listExpenses: typeof import("./expense.usecase").listExpenses;
  let updateExpense: typeof import("./expense.usecase").updateExpense;
  let removeMemberFromGroup: typeof import(
    "@/server/group/usecase/group.usecase"
  ).removeMemberFromGroup;
  let userNetInGroup: typeof import("./balance.usecase").userNetInGroup;
  let netWithUser: typeof import("./balance.usecase").netWithUser;
  let getFriendLedger: typeof import("./balance.usecase").getFriendLedger;
  let closePool: () => Promise<void>;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    // Set before importing db.ts, which reads DATABASE_URL when it first
    // builds the pool.
    process.env.DATABASE_URL = TEST_URL;
    const dbModule = await import("@/server/common/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({
      createExpense,
      deleteExpense,
      deleteSettlement,
      getExpense,
      listExpenses,
      recordSettlement,
      updateExpense,
    } = await import("./expense.usecase"));
    ({ removeMemberFromGroup } = await import("@/server/group/usecase/group.usecase"));
    ({ getFriendLedger, userNetInGroup, netWithUser } = await import("./balance.usecase"));

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await seed(database);
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("records one payment exactly once under a concurrent double-recording", async () => {
    // The incident, replayed at full speed: the same real payment recorded
    // from the friends tab (no scope) and the group page (group scope) at
    // the same moment. Without the pair lock both validations read 5000
    // outstanding, both pass, and the pair ends up double-settled with the
    // balance flipped the other way.
    const settle = (groupId: string) =>
      recordSettlement(DEBTOR, {
        groupId,
        toUserId: CREDITOR,
        amountCents: 5000,
        currency: "USD",
        method: "cash",
        note: "",
      });
    const outcomes = await Promise.allSettled([settle(""), settle("grp-1")]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    // Exactly one row, and it lives in the group — whichever entry point won,
    // the debt's scope decides where the record lands.
    const { rows } = await database.query(
      `SELECT group_id, from_user, to_user, amount_cents FROM settlements`,
    );
    expect(rows).toEqual([
      { group_id: "grp-1", from_user: DEBTOR, to_user: CREDITOR, amount_cents: 5000 },
    ]);
  });

  it("moves every ledger the pair can see, together", async () => {
    // The other half of the incident: a friends-tab settlement used to leave
    // the group still demanding the money. One recording must zero both.
    expect(await userNetInGroup(DEBTOR, "grp-1")).toBe(0);
    expect(await netWithUser(DEBTOR, CREDITOR)).toEqual(new Map());
  });

  it("refuses to delete the settled expense but lets an edit rebalance the payment", async () => {
    /**
     * The campsite expense with a replacement total, split evenly between
     * the two members as it was recorded.
     *
     * @param totalCents - Replacement total; each member's share is half.
     * @returns A full replacement request for exp-1.
     */
    const campsite = (totalCents: number) =>
      ({
        groupId: "grp-1",
        description: "Campsite",
        amountCents: totalCents,
        currency: "USD",
        category: "general",
        expenseDate: "2026-07-28",
        splitType: "exact",
        notes: "",
        payers: [{ userId: CREDITOR, amountCents: totalCents }],
        splitSpecs: [
          { userId: DEBTOR, amountCents: totalCents / 2, percentBp: 0, shares: 0 },
          { userId: CREDITOR, amountCents: totalCents / 2, percentBp: 0, shares: 0 },
        ],
        items: [],
        taxCents: 0,
        tipCents: 0,
      }) as never;

    // Deleting is the creator's call, not the debtor's.
    await expect(deleteExpense(DEBTOR, "exp-1")).rejects.toThrow(/only the expense creator/);
    // The detail view is told a payment postdates the expense, so the
    // clients warn before an edit or a delete that will rebalance it.
    expect((await getExpense(CREDITOR, "exp-1")).hasLaterSettlement).toBe(true);

    // Editing is the correction path, open to anyone on the expense — here
    // the debtor, who did not create it. The payment stays, the balance
    // moves: they paid 5000 against a 5000 share; at a 4000 share they are
    // owed the 1000 they overpaid …
    await updateExpense(DEBTOR, "exp-1", campsite(8000));
    expect(await userNetInGroup(DEBTOR, "grp-1")).toBe(1000);
    // … and at a 6000 share they owe the extra 1000 instead.
    await updateExpense(CREDITOR, "exp-1", campsite(12_000));
    expect(await userNetInGroup(DEBTOR, "grp-1")).toBe(-1000);

    // Back to the recorded split, so the rest of the suite sees the settled
    // ledger it expects.
    await updateExpense(CREDITOR, "exp-1", campsite(10_000));
    expect(await userNetInGroup(DEBTOR, "grp-1")).toBe(0);
    const { rows } = await database.query(
      `SELECT description, deleted_at FROM expenses WHERE id = 'exp-1'`,
    );
    expect(rows).toEqual([{ description: "Campsite", deleted_at: null }]);
  });

  it("still allows correction of an expense created after an older settlement", async () => {
    const laterExpense = await createExpense(CREDITOR, {
      groupId: "grp-1",
      description: "Personal snack",
      amountCents: 250,
      currency: "USD",
      category: "food",
      expenseDate: "2026-07-29",
      splitType: "exact",
      notes: "",
      payers: [{ userId: CREDITOR, amountCents: 250 }],
      splitSpecs: [{ userId: CREDITOR, amountCents: 250, percentBp: 0, shares: 0 }],
      items: [],
      taxCents: 0,
      tipCents: 0,
    } as never);

    await updateExpense(CREDITOR, laterExpense.id, {
      groupId: "grp-1",
      description: "Personal snack corrected",
      amountCents: 250,
      currency: "USD",
      category: "food",
      expenseDate: "2026-07-29",
      splitType: "exact",
      notes: "",
      payers: [{ userId: CREDITOR, amountCents: 250 }],
      splitSpecs: [{ userId: CREDITOR, amountCents: 250, percentBp: 0, shares: 0 }],
      items: [],
      taxCents: 0,
      tipCents: 0,
    } as never);

    const { rows } = await database.query(`SELECT description FROM expenses WHERE id = $1`, [
      laterExpense.id,
    ]);
    expect(rows).toEqual([{ description: "Personal snack corrected" }]);
    expect((await getExpense(CREDITOR, laterExpense.id)).hasLaterSettlement).toBe(false);
  });

  it("refuses a later recording of the already-settled debt from any page", async () => {
    await expect(
      recordSettlement(DEBTOR, {
        groupId: "grp-1",
        toUserId: CREDITOR,
        amountCents: 5000,
        currency: "USD",
        method: "cash",
        note: "",
      }),
    ).rejects.toThrow(/don't owe this person anything/);
    await expect(
      recordSettlement(DEBTOR, {
        groupId: "",
        toUserId: CREDITOR,
        amountCents: 5000,
        currency: "USD",
        method: "cash",
        note: "",
      }),
    ).rejects.toThrow(/don't owe this person anything/);
  });

  it("wrote the feed row for the surviving recording alone", async () => {
    const { rows } = await database.query(
      `SELECT count(*)::int AS settlement_rows FROM activity WHERE type = 'settlement'`,
    );
    expect(rows[0].settlement_rows).toBe(1);
  });

  it("keeps a deleted expense visible while the payment made against it stays", async () => {
    /**
     * A settlement request between the pair inside the group.
     *
     * @param fromUserId - Who is recording that they paid.
     * @param toUserId - Who received the money.
     * @param amountCents - How much moved.
     * @returns The request shape recordSettlement accepts.
     */
    const payment = (fromUserId: string, toUserId: string, amountCents: number) =>
      [fromUserId, { groupId: "grp-1", toUserId, amountCents, currency: "USD", method: "cash", note: "" }] as const;

    const snack = await createExpense(CREDITOR, {
      groupId: "grp-1",
      description: "Snack run",
      amountCents: 3000,
      currency: "USD",
      category: "food",
      expenseDate: "2026-07-30",
      splitType: "exact",
      notes: "",
      payers: [{ userId: CREDITOR, amountCents: 3000 }],
      splitSpecs: [{ userId: DEBTOR, amountCents: 3000, percentBp: 0, shares: 0 }],
      items: [],
      taxCents: 0,
      tipCents: 0,
    } as never);
    await recordSettlement(...payment(DEBTOR, CREDITOR, 3000));
    expect(await userNetInGroup(DEBTOR, "grp-1")).toBe(0);

    await deleteExpense(CREDITOR, snack.id);

    // Delete means owed-to-zero; the payment stays, so the debtor is now owed
    // the 3000 they paid for an expense that no longer counts.
    expect(await userNetInGroup(DEBTOR, "grp-1")).toBe(3000);
    // … and every ledger surface still shows the row that explains why.
    const listed = await listExpenses(DEBTOR, { groupId: "grp-1" });
    expect(listed.expenses.find((expense) => expense.id === snack.id)?.deletedAt).not.toBe("");
    expect(listed.settledExpenseIds).not.toContain(snack.id);
    const detail = await getExpense(DEBTOR, snack.id);
    expect(detail.expense.deletedAt).not.toBe("");
    expect(detail.history.map((event) => event.type)).toContain("expense_deleted");
    const ledgerLine = (await getFriendLedger(DEBTOR, CREDITOR)).entries.find(
      (entry) => entry.kind === "expense" && entry.id === snack.id,
    );
    expect(ledgerLine).toMatchObject({ deleted: true, deltaCents: 0, totalCents: 3000 });

    // The creditor refunds the 3000, so the rest of the suite sees the
    // settled ledger it expects.
    await recordSettlement(...payment(CREDITOR, DEBTOR, 3000));
    expect(await userNetInGroup(DEBTOR, "grp-1")).toBe(0);
  });

  it("brings the debt back when a mistaken payment is removed, keeping the line", async () => {
    const fuel = await createExpense(CREDITOR, {
      groupId: "grp-1",
      description: "Fuel",
      amountCents: 2000,
      currency: "USD",
      category: "transport",
      expenseDate: "2026-07-31",
      splitType: "exact",
      notes: "",
      payers: [{ userId: CREDITOR, amountCents: 2000 }],
      splitSpecs: [{ userId: DEBTOR, amountCents: 2000, percentBp: 0, shares: 0 }],
      items: [],
      taxCents: 0,
      tipCents: 0,
    } as never);
    const mistaken = await recordSettlement(DEBTOR, {
      groupId: "grp-1",
      toUserId: CREDITOR,
      amountCents: 2000,
      currency: "USD",
      method: "cash",
      note: "",
    });
    expect(await userNetInGroup(DEBTOR, "grp-1")).toBe(0);

    // The recipient may remove it too; here the payer who mistyped it does.
    await deleteSettlement(DEBTOR, mistaken.id);

    expect(await userNetInGroup(DEBTOR, "grp-1")).toBe(-2000);
    const ledgerLine = (await getFriendLedger(DEBTOR, CREDITOR)).entries.find(
      (entry) => entry.kind === "settlement" && entry.id === mistaken.id,
    );
    expect(ledgerLine).toMatchObject({ deleted: true, deltaCents: 0, totalCents: 2000 });
    await expect(deleteSettlement(DEBTOR, mistaken.id)).rejects.toThrow(/payment not found/);

    // Pay it for real, so the rest of the suite sees the settled ledger it
    // expects — and prove the guard counts the removed payment as gone.
    await recordSettlement(DEBTOR, {
      groupId: "grp-1",
      toUserId: CREDITOR,
      amountCents: 2000,
      currency: "USD",
      method: "cash",
      note: "",
    });
    expect(await userNetInGroup(DEBTOR, "grp-1")).toBe(0);
    expect(fuel.id).toBeTruthy();
  });

  it("serializes member removal against a new expense for that member", async () => {
    const outcomes = await Promise.allSettled([
      removeMemberFromGroup(CREDITOR, { groupId: "grp-1", userId: DEBTOR }),
      createExpense(CREDITOR, {
        groupId: "grp-1",
        description: "Late fee",
        amountCents: 100,
        currency: "USD",
        category: "general",
        expenseDate: "2026-07-29",
        splitType: "exact",
        notes: "",
        payers: [{ userId: CREDITOR, amountCents: 100 }],
        splitSpecs: [{ userId: DEBTOR, amountCents: 100, percentBp: 0, shares: 0 }],
        items: [],
        taxCents: 0,
        tipCents: 0,
      } as never),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const membership = await database.query(
      `SELECT 1 FROM group_members WHERE group_id = 'grp-1' AND user_id = $1`,
      [DEBTOR],
    );
    const expense = await database.query(
      `SELECT 1 FROM expenses WHERE group_id = 'grp-1' AND description = 'Late fee'`,
    );
    expect(membership.rowCount).toBe(expense.rowCount);
  });

  /** Counts every settlement row, so a replay can be shown to add none. */
  const settlementCount = async (): Promise<number> =>
    Number((await database.query(`SELECT count(*) AS total FROM settlements`)).rows[0].total);

  // H-03: a retry of a lost response must find the first attempt's result,
  // not store a second one. The claim commits with the business row, so a
  // concurrent duplicate blocks on it and then replays.
  it("replays a retried expense instead of storing it twice", async () => {
    // The earlier removal race may have left the pair sharing no group, and
    // a one-off needs a friendship or a shared group; make the friendship.
    await database.query(
      `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)
       ON CONFLICT DO NOTHING`,
      [CREDITOR, DEBTOR],
    );
    const request = {
      groupId: "",
      description: "Retried lunch",
      amountCents: 800,
      currency: "USD",
      category: "food",
      expenseDate: "2026-07-30",
      splitType: "exact",
      notes: "",
      payers: [{ userId: CREDITOR, amountCents: 800 }],
      splitSpecs: [{ userId: DEBTOR, amountCents: 800, percentBp: 0, shares: 0 }],
      items: [],
      taxCents: 0,
      tipCents: 0,
      operationId: "op-lunch",
    } as never;
    const [first, concurrent] = await Promise.all([
      createExpense(CREDITOR, request),
      createExpense(CREDITOR, request),
    ]);
    const retried = await createExpense(CREDITOR, request);
    expect(concurrent.id).toBe(first.id);
    expect(retried.id).toBe(first.id);
    const stored = await database.query(
      `SELECT count(*) AS total FROM expenses WHERE description = 'Retried lunch'`,
    );
    expect(Number(stored.rows[0].total)).toBe(1);
  });

  it("replays a retried payment and refuses the id for a different one", async () => {
    const before = await settlementCount();
    const request = {
      groupId: "",
      toUserId: CREDITOR,
      amountCents: 300,
      currency: "USD",
      method: "cash",
      note: "",
      operationId: "op-pay",
    };
    const first = await recordSettlement(DEBTOR, request);
    const retried = await recordSettlement(DEBTOR, request);
    expect(retried.id).toBe(first.id);
    expect(await settlementCount()).toBe(before + 1);
    // Same id, different amount: not a retry, and not silently the old result.
    await expect(recordSettlement(DEBTOR, { ...request, amountCents: 200 })).rejects.toThrow(
      /already used for a different request/,
    );
    expect(await settlementCount()).toBe(before + 1);
  });
});
