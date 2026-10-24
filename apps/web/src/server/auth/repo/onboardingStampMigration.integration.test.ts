/**
 * Integration test for the migration that dates early accounts from when
 * they were made instead of from the instant onboarding was introduced,
 * run against a real Postgres.
 *
 * The harness migrates an empty database, where this migration has nothing
 * to change, so the suite seeds accounts the way the onboarding migration
 * left them (one shared stamp on every row that existed, real onboardings
 * after it) and then runs the migration's own SQL over them: once, and
 * again.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_onboarding_stamp_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

/** The migration under test, read from disk so the test runs what ships. */
const MIGRATION_SQL = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../migrations/1792838306857_date-early-accounts-from-creation.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const [UP_SQL] = MIGRATION_SQL.split("-- Down Migration");

/** The instant the onboarding migration stamped on every existing row. */
const STAMP = "2026-07-20T09:00:00.000Z";

/** Accounts as the onboarding migration left them, with what each should read after. */
const ACCOUNTS = {
  /** Signed up before onboarding existed. */
  early: { id: "early-1", createdAt: "2026-07-05T12:00:00.000Z" },
  /** Signed up before onboarding existed, through a password. */
  earlyPassword: { id: "early-2", createdAt: "2026-07-10T08:30:00.000Z" },
  /** Invited before onboarding existed, and has never signed in. */
  waiting: { id: "waiting-1", createdAt: "2026-07-08T18:00:00.000Z" },
  /** Signed up and went through onboarding afterwards. */
  later: { id: "later-1", createdAt: "2026-08-01T10:00:00.000Z", onboardedAt: "2026-08-01T10:05:00.000Z" },
} as const;

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

describe.skipIf(!(await databaseReachable()))("onboarding stamp migration against Postgres", () => {
  let database: Client;

  /** @returns Every account's onboarded_at as RFC 3339 (null when unset), by id. */
  async function onboardedAt(): Promise<Record<string, string | null>> {
    const { rows } = await database.query<{ id: string; onboarded_at: Date | null }>(
      "SELECT id, onboarded_at FROM users",
    );
    return Object.fromEntries(
      rows.map((resultRow) => [resultRow.id, resultRow.onboarded_at?.toISOString() ?? null]),
    );
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    const { runner } = await import("node-pg-migrate");
    await runner({
      databaseUrl: TEST_URL,
      dir: fileURLToPath(new URL("../../../../migrations/", import.meta.url)),
      direction: "up",
      migrationsTable: "pgmigrations",
      log: () => undefined,
    });
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, google_sub, password_hash, created_at, onboarded_at) VALUES
         ($1, 'early@example.com', 'Early One', '#c73e2e', 'google-early', NULL, $2, $9),
         ($3, 'early2@example.com', 'Early Two', '#0f8a5f', NULL, 'scrypt$hash', $4, $9),
         ($5, 'waiting@example.com', 'Still Invited', '#1d4ed8', NULL, NULL, $6, $9),
         ($7, 'later@example.com', 'Later One', '#7c3aed', 'google-later', NULL, $8, $10)`,
      [
        ACCOUNTS.early.id,
        ACCOUNTS.early.createdAt,
        ACCOUNTS.earlyPassword.id,
        ACCOUNTS.earlyPassword.createdAt,
        ACCOUNTS.waiting.id,
        ACCOUNTS.waiting.createdAt,
        ACCOUNTS.later.id,
        ACCOUNTS.later.createdAt,
        STAMP,
        ACCOUNTS.later.onboardedAt,
      ],
    );
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("dates stamped accounts from when they were made, and clears a placeholder's stamp", async () => {
    await database.query(UP_SQL!);

    expect(await onboardedAt()).toEqual({
      [ACCOUNTS.early.id]: ACCOUNTS.early.createdAt,
      [ACCOUNTS.earlyPassword.id]: ACCOUNTS.earlyPassword.createdAt,
      [ACCOUNTS.waiting.id]: null,
      [ACCOUNTS.later.id]: ACCOUNTS.later.onboardedAt,
    });
  });

  it("changes nothing when no instant is shared, as on a database that was empty when stamped", async () => {
    const before = await onboardedAt();

    await database.query(UP_SQL!);

    expect(await onboardedAt()).toEqual(before);
  });
});
