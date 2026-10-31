/**
 * Real PostgreSQL check: the batched one-off balances come out
 * exactly as a read per pair would give them, for several people at once,
 * across shared three-way expenses, two currencies, a deleted expense, a
 * group expense and payments both ways.
 */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_one_off_nets_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const ANIKA = "nets-anika";
const BRUNO = "nets-bruno";
const CARLA = "nets-carla";
const DEREK = "nets-derek";
const ELENA = "nets-elena";

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

describe.skipIf(!reachable)("one-off balances for many people against Postgres", () => {
  let database: Client;
  let oneOffNetsWith: typeof import("./balance.usecase").oneOffNetsWith;
  let closePool: () => Promise<void>;

  /**
   * Stores an expense with one payer.
   *
   * @param expense - Its id, group (null for one-off), currency, payer, shares and whether deleted.
   */
  async function expense(expense: {
    id: string;
    groupId: string | null;
    currency: string;
    payerId: string;
    shares: [string, number][];
    deleted?: boolean;
  }): Promise<void> {
    const totalCents = expense.shares.reduce((total, [, cents]) => total + cents, 0);
    await database.query(
      `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by, deleted_at)
       VALUES ($1, $2, $1, $3, $4, '2026-10-20', 'exact', $5, $6)`,
      [expense.id, expense.groupId, totalCents, expense.currency, expense.payerId, expense.deleted ? new Date() : null],
    );
    await database.query("INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ($1, $2, $3)", [
      expense.id, expense.payerId, totalCents,
    ]);
    for (const [userId, cents] of expense.shares) {
      await database.query("INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ($1, $2, $3)", [
        expense.id, userId, cents,
      ]);
    }
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
    ({ oneOffNetsWith } = await import("./balance.usecase"));
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    for (const userId of [ANIKA, BRUNO, CARLA, DEREK, ELENA]) {
      await database.query(
        "INSERT INTO users (id, email, name, avatar_color, google_sub) VALUES ($1, $2, $1, '#336699', $3)",
        [userId, `${userId}@example.com`, `google-${userId}`],
      );
    }
    await database.query("INSERT INTO groups (id, name, created_by) VALUES ('nets-group', 'Trip', $1)", [ANIKA]);
    await database.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ('nets-group', $1, 'owner'), ('nets-group', $2, 'member')",
      [ANIKA, DEREK],
    );

    // Anika paid 30.00 three ways: Bruno and Carla each owe her 10.00.
    await expense({ id: "nets-dinner", groupId: null, currency: "USD", payerId: ANIKA, shares: [[ANIKA, 1000], [BRUNO, 1000], [CARLA, 1000]] });
    // Bruno paid 20.00 for himself and Anika: she owes him 10.00, cancelling.
    await expense({ id: "nets-taxi", groupId: null, currency: "USD", payerId: BRUNO, shares: [[ANIKA, 1000], [BRUNO, 1000]] });
    // Carla paid EUR 9.00 for herself and Anika: Anika owes her EUR 4.50.
    await expense({ id: "nets-museum", groupId: null, currency: "EUR", payerId: CARLA, shares: [[ANIKA, 450], [CARLA, 450]] });
    // Deleted, a group expense, and one Anika is not on: none of them count.
    await expense({ id: "nets-deleted", groupId: null, currency: "USD", payerId: ANIKA, shares: [[ANIKA, 500], [DEREK, 500]], deleted: true });
    await expense({ id: "nets-in-group", groupId: "nets-group", currency: "USD", payerId: ANIKA, shares: [[ANIKA, 500], [DEREK, 500]] });
    await expense({ id: "nets-without-anika", groupId: null, currency: "USD", payerId: BRUNO, shares: [[BRUNO, 500], [CARLA, 500]] });
    // Bruno then paid Anika 5.00 one-off, so now she owes him 5.00; a group
    // payment between Anika and Derek belongs to the group, not here.
    await database.query(
      `INSERT INTO settlements (id, group_id, from_user, to_user, amount_cents, currency, method, recorded_by) VALUES
         ('nets-paid-back', NULL, $1, $2, 500, 'USD', 'cash', $1),
         ('nets-group-payment', 'nets-group', $3, $2, 300, 'USD', 'cash', $3)`,
      [BRUNO, ANIKA, DEREK],
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

  it("works out every pair's one-off balance, per currency, from one batch", async () => {
    const nets = await oneOffNetsWith(ANIKA, [BRUNO, CARLA, DEREK, ELENA, BRUNO, ANIKA]);

    expect(nets).toEqual(
      new Map([
        [BRUNO, new Map([["USD", -500]])],
        [CARLA, new Map([["USD", 1000], ["EUR", -450]])],
        [DEREK, new Map()],
        [ELENA, new Map()],
      ]),
    );
  });

  it("gives each pair the same balance asked alone as asked with everyone", async () => {
    const together = await oneOffNetsWith(ANIKA, [BRUNO, CARLA, DEREK]);
    for (const otherUserId of [BRUNO, CARLA, DEREK]) {
      expect((await oneOffNetsWith(ANIKA, [otherUserId])).get(otherUserId)).toEqual(together.get(otherUserId));
    }
  });
});
