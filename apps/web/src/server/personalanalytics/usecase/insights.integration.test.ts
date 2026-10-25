/**
 * Integration test for personal insights, against a real Postgres.
 *
 * The domain tests prove the arithmetic once rows are grouped; none of them
 * can prove the property this feature rests on: that the SQL reads the
 * caller's own ledger and nothing else. This suite seeds a small world with
 * the rows that would give a wrong query away (a deleted expense, one from
 * before the window, one between two other people, a removed payment, a
 * second currency) and checks every figure the usecase returns.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_insights_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const CALLER = "caller-1";
const ANIKA = "anika-1";
const RIFAT = "rifat-1";
const NEWCOMER = "newcomer-1";

/**
 * The "YYYY-MM" a number of months before the current UTC month.
 *
 * @param monthsAgo - Whole months to step back; 0 is the current month.
 * @returns The month key.
 */
function monthKey(monthsAgo: number): string {
  const nowTime = new Date();
  return new Date(Date.UTC(nowTime.getUTCFullYear(), nowTime.getUTCMonth() - monthsAgo, 1))
    .toISOString()
    .slice(0, 7);
}

/** What getInsights returns. */
type Insights = Awaited<ReturnType<typeof import("./insights.usecase").getInsights>>;

/**
 * Every companion in every currency, each person once.
 *
 * @param insights - A getInsights result.
 * @returns Their user ids, in the order first seen.
 */
function companionIds(insights: Insights): string[] {
  const userIds = insights.currencies.flatMap((block) =>
    block.companions.map((companion) => companion.userId),
  );
  return [...new Set(userIds)];
}

/**
 * How many of the window's expenses the split-type lists count, across
 * every currency. Each expense has one currency and one split type, so this
 * is the window's expense count.
 *
 * @param insights - A getInsights result.
 * @returns The count.
 */
function expenseTotal(insights: Insights): number {
  return insights.currencies
    .flatMap((block) => block.splitTypes)
    .reduce((count, entry) => count + entry.expenseCount, 0);
}

const THIS_MONTH = monthKey(0);
const LAST_MONTH = monthKey(1);
const LONG_AGO = monthKey(30);

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
 * Inserts one expense with its payer and split rows.
 *
 * @param database - Connected client on the test database.
 * @param expense - The expense, who paid, and who owes what.
 */
async function insertExpense(
  database: Client,
  expense: {
    id: string;
    groupId: string | null;
    amountCents: number;
    currency: string;
    category: string;
    date: string;
    splitType: string;
    paidBy: string;
    splits: Record<string, number>;
    deleted?: boolean;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO expenses
       (id, group_id, description, amount_cents, currency, category, expense_date, split_type,
        created_by, deleted_at, deleted_by)
     VALUES ($1, $2, 'seeded', $3, $4, $5, $6, $7, $8,
             CASE WHEN $9 THEN now() END, CASE WHEN $9 THEN $8 END)`,
    [
      expense.id,
      expense.groupId,
      expense.amountCents,
      expense.currency,
      expense.category,
      expense.date,
      expense.splitType,
      expense.paidBy,
      expense.deleted ?? false,
    ],
  );
  await database.query(
    `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, $3)`,
    [expense.id, expense.paidBy, expense.amountCents],
  );
  for (const [userId, owedCents] of Object.entries(expense.splits)) {
    await database.query(
      `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, $3)`,
      [expense.id, userId, owedCents],
    );
  }
}

/**
 * Seeds the world described in the file header.
 *
 * @param database - Connected client on the test database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub) VALUES
       ($1, 'caller@example.com', 'Caller Person', '#c73e2e', '2026-01-15T10:00:00Z', 'google-caller'),
       ($2, 'anika@example.com', 'Anika Rahman', '#0f8a5f', now(), 'google-anika'),
       ($3, 'rifat@example.com', 'Rifat Khan', '#1d4ed8', now(), 'google-rifat'),
       ($4, 'newcomer@example.com', 'New Comer', '#7c3aed', now(), 'google-newcomer')`,
    [CALLER, ANIKA, RIFAT, NEWCOMER],
  );
  await database.query(
    `INSERT INTO groups (id, name, type, created_by) VALUES
       ('grp-trip', 'Cox''s Bazar', 'trip', $1), ('grp-theirs', 'Not Mine', 'home', $2)`,
    [CALLER, ANIKA],
  );
  await database.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES
       ('grp-trip', $1, 'owner'), ('grp-trip', $2, 'member'),
       ('grp-theirs', $2, 'owner'), ('grp-theirs', $3, 'member')`,
    [CALLER, ANIKA, RIFAT],
  );
  await database.query(
    `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1), ($2, $3), ($3, $2)`,
    [CALLER, ANIKA, RIFAT],
  );

  // A group dinner the caller fronted and owes half of.
  await insertExpense(database, {
    id: "exp-dinner",
    groupId: "grp-trip",
    amountCents: 10000,
    currency: "USD",
    category: "food",
    date: `${THIS_MONTH}-05`,
    splitType: "equal",
    paidBy: CALLER,
    splits: { [CALLER]: 5000, [ANIKA]: 5000 },
  });
  // A cab last month that someone else paid for.
  await insertExpense(database, {
    id: "exp-cab",
    groupId: null,
    amountCents: 3000,
    currency: "USD",
    category: "transport",
    date: `${LAST_MONTH}-10`,
    splitType: "exact",
    paidBy: ANIKA,
    splits: { [CALLER]: 1000, [ANIKA]: 2000 },
  });
  // The second currency.
  await insertExpense(database, {
    id: "exp-euro",
    groupId: null,
    amountCents: 2000,
    currency: "EUR",
    category: "food",
    date: `${THIS_MONTH}-02`,
    splitType: "itemized",
    paidBy: RIFAT,
    splits: { [CALLER]: 2000 },
  });
  // Paid by the caller entirely for someone else: fronted, not spent.
  await insertExpense(database, {
    id: "exp-treat",
    groupId: null,
    amountCents: 4000,
    currency: "USD",
    category: "general",
    date: `${THIS_MONTH}-03`,
    splitType: "equal",
    paidBy: CALLER,
    splits: { [ANIKA]: 4000 },
  });
  // Deleted: must count nowhere.
  await insertExpense(database, {
    id: "exp-deleted",
    groupId: "grp-trip",
    amountCents: 99999,
    currency: "USD",
    category: "travel",
    date: `${THIS_MONTH}-04`,
    splitType: "equal",
    paidBy: CALLER,
    splits: { [CALLER]: 99999 },
    deleted: true,
  });
  // Before the window: lifetime only.
  await insertExpense(database, {
    id: "exp-old",
    groupId: null,
    amountCents: 700,
    currency: "USD",
    category: "groceries",
    date: `${LONG_AGO}-15`,
    splitType: "equal",
    paidBy: CALLER,
    splits: { [CALLER]: 700 },
  });
  // Between two other people, in a group the caller is not in.
  await insertExpense(database, {
    id: "exp-theirs",
    groupId: "grp-theirs",
    amountCents: 50000,
    currency: "USD",
    category: "housing",
    date: `${THIS_MONTH}-06`,
    splitType: "equal",
    paidBy: ANIKA,
    splits: { [ANIKA]: 25000, [RIFAT]: 25000 },
  });

  await database.query(
    `INSERT INTO settlements
       (id, from_user, to_user, amount_cents, currency, method, recorded_by, created_at, deleted_at, deleted_by)
     VALUES
       ('stl-out', $1, $2, 1000, 'USD', 'venmo', $1, now(), NULL, NULL),
       ('stl-in', $2, $1, 500, 'USD', 'cash', $2, now(), NULL, NULL),
       ('stl-removed', $1, $2, 7777, 'USD', 'cash', $1, now(), now(), $1),
       ('stl-old', $1, $2, 900, 'USD', 'cash', $1, now() - interval '3 years', NULL, NULL),
       ('stl-theirs', $2, $3, 8888, 'USD', 'cash', $2, now(), NULL, NULL)`,
    [CALLER, ANIKA, RIFAT],
  );
  // The rest of stl-out: the same payment also settled the caller's share
  // of the trip, a row of its own written in the same transaction.
  await database.query(
    `INSERT INTO settlements
       (id, group_id, from_user, to_user, amount_cents, currency, method, recorded_by, created_at)
     SELECT 'stl-out-trip', 'grp-trip', from_user, to_user, 500, currency, method, recorded_by, created_at
       FROM settlements WHERE id = 'stl-out'`,
  );
  await database.query(
    `INSERT INTO receipt_scans (id, user_id, outcome) VALUES
       ('scan-1', $1, 'parsed'), ('scan-2', $1, 'parsed'), ('scan-3', $1, 'failed'),
       ('scan-4', $2, 'parsed')`,
    [CALLER, ANIKA],
  );
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("getInsights against Postgres", () => {
  let database: Client;
  let getInsights: typeof import("./insights.usecase").getInsights;
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
    const dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ getInsights } = await import("./insights.usecase"));

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

  it("counts a lifetime that ignores the window, deleted rows and other people", async () => {
    const insights = await getInsights(CALLER, { months: 2, localMonth: "" });

    expect(insights.journey).toEqual({
      memberSince: "2026-01-15T10:00:00.000Z",
      firstExpenseDate: `${LONG_AGO}-15`,
      // dinner, cab, euro, treat, old. Not the deleted one, not theirs.
      expenseCount: 5,
      // out (two rows, one payment), in, old. Not the removed one, not theirs.
      paymentCount: 3,
      groupCount: 1,
      friendCount: 1,
      // Two parsed; the failed attempt and Anika's scan are not the caller's successes.
      receiptScanCount: 2,
    });
  });

  it("covers whole months, oldest first", async () => {
    const insights = await getInsights(CALLER, { months: 2, localMonth: "" });

    expect(insights.months).toEqual([LAST_MONTH, THIS_MONTH]);
  });

  it("keeps each currency's share, outlay and settling apart", async () => {
    const insights = await getInsights(CALLER, { months: 2, localMonth: "" });

    expect(insights.currencies).toMatchObject([
      {
        currency: "USD",
        // Half the dinner and a third of the cab; nothing of the treat.
        shareCents: 6000,
        // The dinner and the treat, paid in full at the counter.
        paidCents: 14000,
        monthlyShareCents: [1000, 5000],
        categories: [
          { category: "food", shareCents: 5000 },
          { category: "transport", shareCents: 1000 },
          { category: "general", shareCents: 0 },
        ],
        settledOutCents: 1500,
        settledInCents: 500,
      },
      {
        currency: "EUR",
        shareCents: 2000,
        paidCents: 0,
        monthlyShareCents: [0, 2000],
        categories: [{ category: "food", shareCents: 2000 }],
        settledOutCents: 0,
        settledInCents: 0,
      },
    ]);
  });

  it("ranks split types, companions and places within each currency", async () => {
    const insights = await getInsights(CALLER, { months: 2, localMonth: "" });
    const [dollars, euros] = insights.currencies;

    // The dinner, the cab and the treat were in dollars, all with Anika.
    expect(dollars?.splitTypes).toEqual([
      { splitType: "equal", expenseCount: 2 },
      { splitType: "exact", expenseCount: 1 },
    ]);
    expect(dollars?.companions).toEqual([
      {
        userId: ANIKA,
        name: "Anika Rahman",
        avatarColor: "#0f8a5f",
        avatarUrl: "",
        sharedExpenseCount: 3,
      },
    ]);
    expect(dollars?.groups).toEqual([
      { groupId: "", name: "", type: "", isMember: false, expenseCount: 2 },
      { groupId: "grp-trip", name: "Cox's Bazar", type: "trip", isMember: true, expenseCount: 1 },
    ]);
    // The euro bill was Rifat's, itemized, outside any group: it shows only
    // when euros are chosen, and the dollar lists know nothing of it.
    expect(euros?.splitTypes).toEqual([{ splitType: "itemized", expenseCount: 1 }]);
    expect(euros?.companions).toEqual([
      {
        userId: RIFAT,
        name: "Rifat Khan",
        avatarColor: "#1d4ed8",
        avatarUrl: "",
        sharedExpenseCount: 1,
      },
    ]);
    expect(euros?.groups).toEqual([
      { groupId: "", name: "", type: "", isMember: false, expenseCount: 1 },
    ]);
  });

  it("leaves out someone the caller blocked, and someone who blocked them", async () => {
    await database.query(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [
      CALLER,
      RIFAT,
    ]);
    try {
      const callerView = await getInsights(CALLER, { months: 2, localMonth: "" });
      const blockedView = await getInsights(RIFAT, { months: 2, localMonth: "" });

      expect(companionIds(callerView)).toEqual([ANIKA]);
      expect(companionIds(blockedView)).toEqual([ANIKA]);
      // The money is still theirs: only the person disappears from the list.
      expect(expenseTotal(callerView)).toBe(4);
    } finally {
      await database.query(`DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`, [
        CALLER,
        RIFAT,
      ]);
    }
  });

  it("leaves out the stand-in a deleted account leaves behind", async () => {
    // Anika's dinner share moved to an anonymous stand-in when she deleted
    // her account; the stand-in has no one behind it to split with.
    await database.query(
      `INSERT INTO users (id, name, avatar_color, deleted_at) VALUES ('stand-in-1', 'Deleted member', '#857a68', now())`,
    );
    await database.query(`UPDATE expense_splits SET user_id = 'stand-in-1' WHERE expense_id = 'exp-dinner' AND user_id = $1`, [
      ANIKA,
    ]);
    try {
      const insights = await getInsights(CALLER, { months: 2, localMonth: "" });

      expect(companionIds(insights)).not.toContain("stand-in-1");
      // The money is still the caller's: only the stand-in leaves the list.
      expect(expenseTotal(insights)).toBe(4);
    } finally {
      await database.query(`UPDATE expense_splits SET user_id = $1 WHERE expense_id = 'exp-dinner' AND user_id = 'stand-in-1'`, [
        ANIKA,
      ]);
      await database.query(`DELETE FROM users WHERE id = 'stand-in-1'`);
    }
  });

  it("still counts a group the caller has left, and says they are no longer in it", async () => {
    // Anika left the trip after the dinner; her share of it is still hers.
    await database.query(`DELETE FROM group_members WHERE group_id = 'grp-trip' AND user_id = $1`, [
      ANIKA,
    ]);
    try {
      const insights = await getInsights(ANIKA, { months: 2, localMonth: "" });

      const places = insights.currencies.flatMap((block) => block.groups);
      expect(places.find((place) => place.groupId === "grp-trip")).toEqual({
        groupId: "grp-trip",
        name: "Cox's Bazar",
        type: "trip",
        isMember: false,
        expenseCount: 1,
      });
      expect(places.find((place) => place.groupId === "grp-theirs")).toMatchObject({
        isMember: true,
      });
    } finally {
      await database.query(
        `INSERT INTO group_members (group_id, user_id, role) VALUES ('grp-trip', $1, 'member')`,
        [ANIKA],
      );
    }
  });

  it("widens to the older expense when the window does", async () => {
    const insights = await getInsights(CALLER, { months: 24, localMonth: "" });

    expect(insights.months).toHaveLength(24);
    // 30 months back is still outside two years: the same four expenses.
    expect(expenseTotal(insights)).toBe(4);
  });

  it("returns an empty dashboard, not an error, for someone with no history", async () => {
    const insights = await getInsights(NEWCOMER, { months: 3, localMonth: "" });

    expect(insights.journey).toMatchObject({
      firstExpenseDate: "",
      expenseCount: 0,
      paymentCount: 0,
      groupCount: 0,
      friendCount: 0,
      receiptScanCount: 0,
    });
    expect(insights.months).toHaveLength(3);
    expect(insights.currencies).toEqual([]);
  });

  it("shows a third party only their own side of the same ledger", async () => {
    const insights = await getInsights(RIFAT, { months: 2, localMonth: "" });

    // Rifat fronted the euro bill and owes half of the one in Anika's group;
    // nothing of the caller's dinner, cab or treat reaches him.
    expect(expenseTotal(insights)).toBe(2);
    expect(
      insights.currencies.map((block) => [block.currency, block.shareCents, block.paidCents]),
    ).toEqual([
      ["USD", 25000, 0],
      ["EUR", 0, 2000],
    ]);
    expect(companionIds(insights).sort()).toEqual([ANIKA, CALLER].sort());
  });

  it("refuses an account that no longer exists", async () => {
    await expect(getInsights("nobody", { months: 2, localMonth: "" })).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});
