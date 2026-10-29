/**
 * Real PostgreSQL regression for how often a pair's group histories are read.
 *
 * A payment between two people holds the lock of every group they share
 * while it reads what is owed, and every other money change in those groups
 * waits behind it. Settling on the net needs both directions of the pair's
 * position; each used to read every shared group's whole history again, so
 * the locks were held for two full reads of the same rows. The friend page
 * read the same histories three times, and an expense's page rebuilt its
 * group's whole ledger for the one net it shows. Each now reads a history
 * once or not at all, and gives the same figures: the digest the friend page
 * shows is the one the write accepts, and a person's net in a group, added
 * up by Postgres, is the one the group's page works out from its history.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_pair_ledger_reads_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const SARA = "user-sara";
const TOMAS = "user-tomas";
const LENA = "user-lena";
const FLAT = "grp-flat";
const TRIP = "grp-trip";

/** Expenses in the flat's long history. */
const FLAT_EXPENSES = 2000;

/** What the reads under test did, in order: each history read, group list read and group lock. */
const { reads } = vi.hoisted(() => ({ reads: [] as string[] }));

vi.mock("@/server/expense/repo/expenses.repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/expense/repo/expenses.repo")>();
  return {
    ...actual,
    listExpensesByGroups: async (...args: Parameters<typeof actual.listExpensesByGroups>) => {
      reads.push("group history");
      return actual.listExpensesByGroups(...args);
    },
  };
});
vi.mock("@/server/group/repo/groups.repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/group/repo/groups.repo")>();
  return {
    ...actual,
    listGroupsByUser: async (...args: Parameters<typeof actual.listGroupsByUser>) => {
      reads.push("group list");
      return actual.listGroupsByUser(...args);
    },
  };
});
vi.mock("@/server/common/ledger/ledgerLocks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/common/ledger/ledgerLocks")>();
  return {
    ...actual,
    lockGroupLedgers: async (...args: Parameters<typeof actual.lockGroupLedgers>) => {
      await actual.lockGroupLedgers(...args);
      reads.push("group locks");
    },
  };
});

/**
 * How many reads of one kind ran while the group locks were held: after the
 * last time they were taken.
 *
 * @param kind - The kind of read.
 * @returns The count.
 */
function readsUnderLocks(kind: string): number {
  return reads.slice(reads.lastIndexOf("group locks") + 1).filter((read) => read === kind).length;
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

/**
 * Inserts one expense paid in full by one person and owed in full by another.
 *
 * @param database - Connected client on the test database.
 * @param expense - Id, scope, amount, currency, who paid and who owes.
 */
async function insertDebt(
  database: Client,
  expense: { id: string; groupId: string | null; amountCents: number; currency: string; paidBy: string; owedBy: string },
): Promise<void> {
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ($1, $2, $1, $3, $4, '2026-10-01', 'exact', $5)`,
    [expense.id, expense.groupId, expense.amountCents, expense.currency, expense.paidBy],
  );
  await database.query(`INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, $3)`, [
    expense.id, expense.paidBy, expense.amountCents,
  ]);
  await database.query(`INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, $3)`, [
    expense.id, expense.owedBy, expense.amountCents,
  ]);
}

/**
 * Seeds the pair. The flat (pairwise) has a long history that leaves Sara
 * owing Tomas 2,000.00; the trip simplifies its debts, so Sara owes Tomas
 * 30.00 there through Lena although the two never shared an expense in it;
 * one to one, Tomas owes Sara 25.00 and €7.00.
 *
 * @param database - Connected client on the test database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
     VALUES ($1, 'sara@example.com', 'Sara', '#c73e2e', now(), 'google-sara'),
            ($2, 'tomas@example.com', 'Tomas', '#0f8a5f', now(), 'google-tomas'),
            ($3, 'lena@example.com', 'Lena', '#1c4fa0', now(), 'google-lena')`,
    [SARA, TOMAS, LENA],
  );
  await database.query(
    `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)`,
    [SARA, TOMAS],
  );
  await database.query(
    `INSERT INTO groups (id, name, currency, created_by, simplify_debts)
     VALUES ($1, 'Flat', 'USD', $3, false), ($2, 'Trip', 'USD', $3, true)`,
    [FLAT, TRIP, SARA],
  );
  await database.query(
    `INSERT INTO group_members (group_id, user_id, role)
     VALUES ($1, $3, 'owner'), ($1, $4, 'member'),
            ($2, $3, 'owner'), ($2, $4, 'member'), ($2, $5, 'member')`,
    [FLAT, TRIP, SARA, TOMAS, LENA],
  );
  // Three of every four expenses Tomas paid for Sara, the fourth the reverse.
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
       SELECT 'flat-' || number, $1, 'Groceries', 200, 'USD', '2026-09-01', 'exact', $2
         FROM generate_series(1, $3::int) AS number`,
    [FLAT, SARA, FLAT_EXPENSES],
  );
  await database.query(
    `INSERT INTO expense_payers (expense_id, user_id, amount_cents)
       SELECT 'flat-' || number, CASE WHEN number % 4 = 0 THEN $1 ELSE $2 END, 200
         FROM generate_series(1, $3::int) AS number`,
    [SARA, TOMAS, FLAT_EXPENSES],
  );
  await database.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_cents)
       SELECT 'flat-' || number, CASE WHEN number % 4 = 0 THEN $2 ELSE $1 END, 200
         FROM generate_series(1, $3::int) AS number`,
    [SARA, TOMAS, FLAT_EXPENSES],
  );
  await insertDebt(database, { id: "trip-hostel", groupId: TRIP, amountCents: 3000, currency: "USD", paidBy: LENA, owedBy: SARA });
  await insertDebt(database, { id: "trip-ferry", groupId: TRIP, amountCents: 3000, currency: "USD", paidBy: TOMAS, owedBy: LENA });
  await insertDebt(database, { id: "taxi", groupId: null, amountCents: 2500, currency: "USD", paidBy: SARA, owedBy: TOMAS });
  await insertDebt(database, { id: "croissants", groupId: null, amountCents: 700, currency: "EUR", paidBy: SARA, owedBy: TOMAS });
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("how often a pair's group histories are read, against Postgres", () => {
  let database: Client;
  let balances: typeof import("./balance.usecase");
  let expenses: typeof import("./expense.usecase");
  let closePool: () => Promise<void>;

  /**
   * The position Sara's settle dialog shows in dollars.
   *
   * @returns Its net (> 0 ⇒ Sara is owed), its scopes, and its digest.
   */
  const saraSeesInDollars = async () => {
    const position = (await balances.getFriendLedger(SARA, TOMAS)).settlePositions.find(
      (candidate) => candidate.currency === "USD",
    );
    return {
      netCents: position?.netCents ?? 0,
      scopes: (position?.scopes ?? []).map((scope) => `${scope.groupId || "direct"} ${scope.netCents}`).sort(),
      digest: position?.digest ?? "",
    };
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
    balances = await import("./balance.usecase");
    expenses = await import("./expense.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await seed(database);
  }, 60_000);

  beforeEach(() => {
    reads.length = 0;
  });

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("reads the shared groups' histories once for the friend page, balances and settle dialog together", async () => {
    const ledger = await balances.getFriendLedger(SARA, TOMAS);

    expect(reads.filter((read) => read === "group history")).toHaveLength(1);
    expect(await saraSeesInDollars()).toMatchObject({
      netCents: -200_500,
      scopes: ["direct 2500", `${FLAT} -200000`, `${TRIP} -3000`],
    });
    expect(ledger.groupBalances.map((scope) => `${scope.groupId || "direct"} ${scope.currency} ${scope.netCents}`).sort())
      .toEqual(["direct EUR 700", "direct USD 2500", `${FLAT} USD -200000`, `${TRIP} USD -3000`]);
  });

  it("shows an expense's page without reading its group's history", async () => {
    const page = await expenses.getExpense(SARA, "flat-1");

    expect(page.expense?.id).toBe("flat-1");
    expect(reads).not.toContain("group history");
  });

  it("settles on the net reading each shared group's history once while holding their locks", async () => {
    const shown = await saraSeesInDollars();
    reads.length = 0;

    await expenses.recordSettlement(SARA, {
      groupId: "",
      toUserId: TOMAS,
      amountCents: 200_500,
      currency: "USD",
      method: "cash",
      note: "",
      netAcrossScopes: true,
      positionDigest: shown.digest,
      operationId: randomUUID(),
    });

    expect(readsUnderLocks("group history")).toBe(1);
    // The one read of who shares which group, to check the set did not grow.
    expect(readsUnderLocks("group list")).toBe(2);
    expect(await saraSeesInDollars()).toEqual({ netCents: 0, scopes: [], digest: "" });
  });

  it("pays a balance in one scope reading it once too", async () => {
    await insertDebt(database, { id: "flat-boiler", groupId: FLAT, amountCents: 4000, currency: "USD", paidBy: TOMAS, owedBy: SARA });
    reads.length = 0;

    await expenses.recordSettlement(SARA, {
      groupId: "",
      toUserId: TOMAS,
      amountCents: 4000,
      currency: "USD",
      method: "cash",
      note: "",
      scopeGroupIds: [FLAT],
      operationId: randomUUID(),
    });

    expect(readsUnderLocks("group history")).toBe(1);
    expect(readsUnderLocks("group list")).toBe(2);
    expect(await saraSeesInDollars()).toEqual({ netCents: 0, scopes: [], digest: "" });
  });

  it("adds a person's net in a group up in Postgres to what the group's page works out from its history", async () => {
    await insertDebt(database, { id: "trip-museum", groupId: TRIP, amountCents: 1800, currency: "USD", paidBy: LENA, owedBy: TOMAS });
    await insertDebt(database, { id: "flat-plant", groupId: FLAT, amountCents: 900, currency: "USD", paidBy: SARA, owedBy: TOMAS });
    await database.query(`UPDATE expenses SET deleted_at = now() WHERE id = 'flat-plant'`);

    for (const groupId of [FLAT, TRIP]) {
      const walked = (await balances.getGroupBalances(SARA, groupId)).byCurrency;
      for (const member of [SARA, TOMAS, LENA]) {
        const expected = new Map(
          walked.flatMap(({ currency, nets }) =>
            nets.filter((memberNet) => memberNet.userId === member && memberNet.netCents !== 0).map((memberNet) => [currency, memberNet.netCents] as const),
          ),
        );
        expect({ groupId, member, net: await balances.userNetInGroup(member, groupId) }).toEqual({
          groupId,
          member,
          net: expected,
        });
      }
    }
    expect(await balances.userNetInGroup(LENA, TRIP)).toEqual(new Map([["USD", 1800]]));
  });
});
