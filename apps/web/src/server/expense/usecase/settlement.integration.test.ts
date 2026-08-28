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
  let updateExpense: typeof import("./expense.usecase").updateExpense;
  let removeMemberFromGroup: typeof import(
    "@/server/group/usecase/group.usecase"
  ).removeMemberFromGroup;
  let userNetInGroup: typeof import("./balance.usecase").userNetInGroup;
  let netWithUser: typeof import("./balance.usecase").netWithUser;
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
    ({ createExpense, deleteExpense, recordSettlement, updateExpense } = await import(
      "./expense.usecase"
    ));
    ({ removeMemberFromGroup } = await import("@/server/group/usecase/group.usecase"));
    ({ userNetInGroup, netWithUser } = await import("./balance.usecase"));

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
    expect(await netWithUser(DEBTOR, CREDITOR)).toBe(0);
  });

  it("keeps the paid debt immutable after settlement", async () => {
    await expect(deleteExpense(CREDITOR, "exp-1")).rejects.toThrow(/add a correction instead/);
    await expect(
      updateExpense(CREDITOR, "exp-1", {
        groupId: "grp-1",
        description: "Campsite corrected",
        amountCents: 10_000,
        currency: "USD",
        category: "general",
        expenseDate: "2026-07-28",
        splitType: "exact",
        notes: "",
        payers: [{ userId: CREDITOR, amountCents: 10_000 }],
        splitSpecs: [
          { userId: DEBTOR, amountCents: 5000, percentBp: 0, shares: 0 },
          { userId: CREDITOR, amountCents: 5000, percentBp: 0, shares: 0 },
        ],
        items: [],
        taxCents: 0,
        tipCents: 0,
      } as never),
    ).rejects.toThrow(/add a correction instead/);

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
});
