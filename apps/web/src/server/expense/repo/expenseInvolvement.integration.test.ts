/**
 * Real PostgreSQL regression: the queries that find the expenses a person is
 * on return exactly the right expenses — paid for, owed on or both, in a
 * group or not, deleted or not, each once — and find them through the
 * per-person indexes instead of reading every expense in the app.
 */

import { Client, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_expense_involvement_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const SARA = "involve-sara";
const TOMAS = "involve-tomas";
const RAHIM = "involve-rahim";
const LENA = "involve-lena";
const TRIP = "involve-trip";

/** One seeded expense: where it is, who paid, who owes, and whether it was deleted. */
interface SeededExpense {
  id: string;
  groupId: string | null;
  payers: string[];
  owers: string[];
  deleted?: boolean;
}

/** Every way a person can be on an expense, or not be on it. */
const EXPENSES: SeededExpense[] = [
  { id: "both-one-off", groupId: null, payers: [SARA], owers: [SARA, TOMAS] },
  { id: "tomas-pays-sara-owes", groupId: null, payers: [TOMAS], owers: [SARA] },
  { id: "neither", groupId: null, payers: [RAHIM], owers: [RAHIM, LENA] },
  { id: "sara-pays-in-group", groupId: TRIP, payers: [SARA], owers: [TOMAS, RAHIM] },
  { id: "deleted-one-off", groupId: null, payers: [SARA], owers: [SARA, TOMAS], deleted: true },
  { id: "sara-owes-in-group", groupId: TRIP, payers: [LENA], owers: [SARA, LENA] },
  { id: "sara-pays-and-owes", groupId: null, payers: [SARA, TOMAS], owers: [SARA, TOMAS, RAHIM] },
  { id: "tomas-and-rahim", groupId: null, payers: [RAHIM], owers: [TOMAS, RAHIM] },
];

/**
 * The seeded expenses a filter keeps, by id, sorted.
 *
 * @param keep - Which expenses to keep.
 * @returns Their ids.
 */
function expected(keep: (expense: SeededExpense) => boolean): string[] {
  return EXPENSES.filter(keep).map((expense) => expense.id).sort();
}

/**
 * Whether a person pays for or owes on a seeded expense.
 *
 * @param expense - The expense.
 * @param personId - The person.
 * @returns True when they are on it.
 */
function isOn(expense: SeededExpense, personId: string): boolean {
  return expense.payers.includes(personId) || expense.owers.includes(personId);
}

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
    await probe.end().catch(() => undefined);
  }
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("which expenses a person is on, against Postgres", () => {
  let database: Client;
  let expenses: typeof import("./expenses.repo");
  let ledger: typeof import("./ledger.repo");
  let closePool: () => Promise<void>;

  /** The ids in a result, sorted. */
  const idsOf = (rows: { id: string }[]) => rows.map((expenseRow) => expenseRow.id).sort();

  /**
   * A client that runs each statement under EXPLAIN ANALYZE and keeps how
   * many pages it read, so a repo function can be measured without copying
   * its SQL here.
   *
   * @returns The client and a reader for the last statement's page count.
   */
  const measuringClient = () => {
    let pagesRead = 0;
    const client = {
      query: async (text: string, params: unknown[]) => {
        const result = await database.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`, params);
        const plan = result.rows[0]["QUERY PLAN"][0].Plan;
        pagesRead = plan["Shared Hit Blocks"] + plan["Shared Read Blocks"];
        return { rows: [] };
      },
    } as unknown as PoolClient;
    return { client, pagesRead: () => pagesRead };
  };

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
    expenses = await import("./expenses.repo");
    ledger = await import("./ledger.repo");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
         SELECT person, person || '@example.com', person, '#c73e2e', now(), 'google-' || person
           FROM unnest($1::text[]) AS person`,
      [[SARA, TOMAS, RAHIM, LENA]],
    );
    await database.query("INSERT INTO groups (id, name, created_by) VALUES ($1, 'Trip', $2)", [TRIP, SARA]);
    for (const [index, expense] of EXPENSES.entries()) {
      await database.query(
        `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by, deleted_at)
         VALUES ($1, $2, 'Seeded', 600, 'USD', $3, 'equal', $4, CASE WHEN $5 THEN now() END)`,
        [expense.id, expense.groupId, `2026-10-${String(index + 1).padStart(2, "0")}`, expense.payers[0], expense.deleted ?? false],
      );
      for (const payer of expense.payers) {
        await database.query("INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, $3)", [
          expense.id, payer, 600 / expense.payers.length,
        ]);
      }
      for (const ower of expense.owers) {
        await database.query("INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, $3)", [
          expense.id, ower, 600 / expense.owers.length,
        ]);
      }
    }
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("finds every live expense a person pays for or owes on, each once", async () => {
    const rows = await expenses.listExpensesInvolvingUser(SARA);

    expect(rows.map((expenseRow) => expenseRow.id)).toHaveLength(new Set(rows.map((expenseRow) => expenseRow.id)).size);
    expect(idsOf(rows)).toEqual(expected((expense) => !expense.deleted && isOn(expense, SARA)));
  });

  it("finds what two people share, in groups or not, deleted included only when asked", async () => {
    const both = (expense: SeededExpense) => isOn(expense, SARA) && isOn(expense, TOMAS);

    expect(idsOf(await expenses.listExpensesBetween(SARA, TOMAS))).toEqual(expected((expense) => !expense.deleted && both(expense)));
    expect(idsOf(await expenses.listExpensesBetween(SARA, TOMAS, true))).toEqual(expected(both));
    expect(idsOf(await expenses.listOneOffExpensesBetween(TOMAS, SARA))).toEqual(
      expected((expense) => !expense.deleted && expense.groupId === null && both(expense)),
    );
    expect(idsOf(await expenses.listOneOffExpensesWithAnyOf(SARA, [RAHIM, LENA]))).toEqual(
      expected(
        (expense) =>
          !expense.deleted && expense.groupId === null && isOn(expense, SARA) && (isOn(expense, RAHIM) || isOn(expense, LENA)),
      ),
    );
    expect(idsOf(await expenses.listExpensesBetweenPage(SARA, TOMAS, null, 50, database as unknown as PoolClient))).toEqual(
      expected(both),
    );
  });

  it("pages through each list's expenses, deleted ones marked rather than dropped", async () => {
    const page = (scope: Parameters<typeof expenses.listExpensePage>[0]) => expenses.listExpensePage(scope, null, 50);

    expect(idsOf(await page({ kind: "user", userId: SARA }))).toEqual(expected((expense) => isOn(expense, SARA)));
    expect(idsOf(await page({ kind: "userOneOff", userId: SARA }))).toEqual(
      expected((expense) => expense.groupId === null && isOn(expense, SARA)),
    );
    expect(idsOf(await page({ kind: "userInGroup", userId: SARA, groupId: TRIP }))).toEqual(
      expected((expense) => expense.groupId === TRIP && isOn(expense, SARA)),
    );
    expect(idsOf(await page({ kind: "withUser", userId: SARA, otherUserId: TOMAS }))).toEqual(
      expected((expense) => expense.groupId === null && isOn(expense, SARA) && isOn(expense, TOMAS)),
    );
  });

  it("changes a pair's statement fingerprint only when an expense they share changes", async () => {
    const digest = () => ledger.pairHistoryDigest(SARA, TOMAS, database as unknown as PoolClient);
    const before = await digest();

    await database.query("UPDATE expense_splits SET owed_cents = owed_cents + 1 WHERE expense_id = 'sara-owes-in-group' AND user_id = $1", [SARA]);
    await database.query("UPDATE expense_splits SET owed_cents = owed_cents + 1 WHERE expense_id = 'neither' AND user_id = $1", [RAHIM]);
    expect(await digest()).toBe(before);

    await database.query("UPDATE expense_splits SET owed_cents = owed_cents + 1 WHERE expense_id = 'tomas-pays-sara-owes'");
    expect(await digest()).not.toBe(before);
  });

  it("reads the expenses at most once over, never checking each one, once there are many", async () => {
    // 40,000 expenses between other people; Sara and Tomas stay on the few above.
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
         SELECT 'crowd-' || number, 'crowd' || number || '@example.com', 'Crowd', '#c73e2e', now(), 'google-crowd-' || number
           FROM generate_series(1, 400) AS number`,
    );
    await database.query(
      `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
         SELECT 'crowd-expense-' || number, CASE WHEN number % 2 = 0 THEN $1 END, 'Crowd', 600, 'USD', '2026-09-01', 'equal',
                'crowd-' || (number % 400 + 1)
           FROM generate_series(1, 40000) AS number`,
      [TRIP],
    );
    await database.query(
      `INSERT INTO expense_payers (expense_id, user_id, amount_cents)
         SELECT 'crowd-expense-' || number, 'crowd-' || (number % 400 + 1), 600 FROM generate_series(1, 40000) AS number`,
    );
    await database.query(
      `INSERT INTO expense_splits (expense_id, user_id, owed_cents)
         SELECT 'crowd-expense-' || number, 'crowd-' || (number % 400 + 1), 600 FROM generate_series(1, 40000) AS number`,
    );
    await database.query("ANALYZE");
    const { rows } = await database.query<{ pages: number }>("SELECT relpages AS pages FROM pg_class WHERE relname = 'expenses'");
    const tablePages = rows[0].pages;
    const { client, pagesRead } = measuringClient();
    const reads: [string, () => Promise<unknown>][] = [
      ["every expense Sara is on", () => expenses.listExpensesInvolvingUser(SARA, client)],
      ["what Sara and Tomas share", () => expenses.listExpensesBetween(SARA, TOMAS, true, client)],
      ["their one-offs", () => expenses.listOneOffExpensesBetween(SARA, TOMAS, client)],
      ["Sara with any of two people", () => expenses.listOneOffExpensesWithAnyOf(SARA, [RAHIM, LENA], client)],
      ["a page of Sara's expenses", () => expenses.listExpensePage({ kind: "user", userId: SARA }, null, 50, client)],
      ["a page of their statement", () => expenses.listExpensesBetweenPage(SARA, TOMAS, null, 50, client)],
      ["their statement's fingerprint", () => ledger.pairHistoryDigest(SARA, TOMAS, client)],
    ];

    // Checking each expense for the person read every expense's payers and
    // shares: about six pages per expense, 240,000 here. Building the
    // person's set once reads their own rows through the per-person indexes
    // and at most one pass over the expenses themselves, whichever way
    // Postgres then joins the two.
    for (const [label, read] of reads) {
      await read();
      expect(pagesRead(), label).toBeLessThan(2 * tablePages);
    }
  }, 60_000);
});
