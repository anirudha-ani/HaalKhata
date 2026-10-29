/**
 * Real PostgreSQL regression at the pool's real size (20 connections):
 * removing friends and sending reminders all at once, more of them than
 * there are connections, every one succeeds. Each holds one connection at a
 * time; when each held its transaction's connection while waiting for a
 * second to read the balance, a burst like this held every connection
 * while all of them waited, and they failed together after the five-second
 * wait for a connection — along with everything else in the app.
 */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_pool_saturation_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

/** More pairs than the pool has connections. */
const PAIRS = 30;

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

describe.skipIf(!reachable)("a burst bigger than the connection pool, against Postgres", () => {
  let database: Client;
  let social: typeof import("./social.usecase");
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
    social = await import("./social.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    // Pair n: "leaver-n" removes settled friend "left-n"; "lender-n" reminds
    // "borrower-n", who owes them 10.00 for a one-off taxi.
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub)
         SELECT role || '-' || number, role || number || '@example.com', initcap(role) || ' ' || number, '#c73e2e', now(),
                'google-' || role || '-' || number
           FROM generate_series(1, $1) AS number, unnest(ARRAY['leaver', 'left', 'lender', 'borrower']) AS role`,
      [PAIRS],
    );
    await database.query(
      `INSERT INTO friendships (user_id, friend_id)
         SELECT a || '-' || number, b || '-' || number FROM generate_series(1, $1) AS number,
                (VALUES ('leaver', 'left'), ('left', 'leaver'), ('lender', 'borrower'), ('borrower', 'lender')) AS pair(a, b)`,
      [PAIRS],
    );
    await database.query(
      `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
         SELECT 'taxi-' || number, NULL, 'Taxi', 2000, 'USD', '2026-10-27', 'equal', 'lender-' || number
           FROM generate_series(1, $1) AS number`,
      [PAIRS],
    );
    await database.query(
      `INSERT INTO expense_payers (expense_id, user_id, amount_cents)
         SELECT 'taxi-' || number, 'lender-' || number, 2000 FROM generate_series(1, $1) AS number`,
      [PAIRS],
    );
    await database.query(
      `INSERT INTO expense_splits (expense_id, user_id, owed_cents)
         SELECT 'taxi-' || number, person || '-' || number, 1000
           FROM generate_series(1, $1) AS number, unnest(ARRAY['lender', 'borrower']) AS person`,
      [PAIRS],
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

  it("removes every friend and sends every reminder when all of them arrive at once", async () => {
    const pairs = Array.from({ length: PAIRS }, (_unused, index) => index + 1);

    const outcomes = await Promise.allSettled([
      ...pairs.map((pair) => social.removeFriend(`leaver-${pair}`, `left-${pair}`)),
      ...pairs.map((pair) => social.sendReminder(`lender-${pair}`, `borrower-${pair}`)),
    ]);

    const failures = outcomes.flatMap((outcome) => (outcome.status === "rejected" ? [String(outcome.reason)] : []));
    expect({ failed: failures.length, firstFailure: failures[0] }).toEqual({ failed: 0, firstFailure: undefined });
    const { rows } = await database.query<{ friendships: number; reminders: number }>(
      `SELECT (SELECT count(*)::int FROM friendships WHERE user_id LIKE 'leaver-%') AS friendships,
              (SELECT count(*)::int FROM notifications WHERE type = 'reminder') AS reminders`,
    );
    expect(rows[0]).toEqual({ friendships: 0, reminders: PAIRS });
  }, 60_000);
});
