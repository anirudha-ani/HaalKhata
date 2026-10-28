/** Verifies the mobile release upgrades an existing main database without losing ledger data. */

import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { runner } from "node-pg-migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_release_migration_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../../../migrations/", import.meta.url));
const MAIN_LAST_MIGRATION = "1791828578558_add-group-status.sql";
const RELEASE_SUFFIXES = ["_apple_sign_in.sql", "_anonymous_ledger_members.sql", "_user_safety.sql", "_add-receipt-account-consent.sql", "_add-contact-discovery.sql", "_add-push-notifications.sql", "_track-push-delivery.sql", "_keep-removed-phones-off.sql", "_remember-provider-verification.sql", "_mark-unknown-provider-checks.sql", "_add-receipt-scans.sql", "_add-admin-sessions.sql", "_add-content-report-author-index.sql", "_date-early-accounts-from-creation.sql", "_index-expense-and-payment-authors.sql", "_retire-unregistered-people.sql", "_add-invite-link-expiry.sql", "_widen-money-columns.sql"];

/** @returns Whether the isolated integration database can be created. */
async function databaseReachable(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try { await client.connect(); return true; }
  catch { return false; }
  finally { await client.end(); }
}

/**
 * Applies the given migration set with the same order checks used at startup.
 * @param directory Migration fixture or the complete release directory.
 * @returns Applied migration records.
 */
function migrate(directory: string) {
  return runner({ databaseUrl: TEST_URL, dir: directory, direction: "up", migrationsTable: "pgmigrations", log: () => undefined });
}

const reachable = await databaseReachable();
describe.skipIf(!reachable)("mobile release database upgrade", () => {
  let baselineDirectory: string;
  let database: Client;
  beforeAll(async () => {
    baselineDirectory = mkdtempSync(join(tmpdir(), "haalkhata-release-baseline-"));
    for (const filename of readdirSync(MIGRATIONS_DIRECTORY)) {
      if (!filename.endsWith(".sql") || filename > MAIN_LAST_MIGRATION || RELEASE_SUFFIXES.some((suffix) => filename.endsWith(suffix))) continue;
      copyFileSync(join(MIGRATIONS_DIRECTORY, filename), join(baselineDirectory, filename));
    }
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    database = new Client({ connectionString: TEST_URL }); await database.connect();
  });
  afterAll(async () => {
    await database?.end();
    const admin = new Client({ connectionString: ADMIN_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
    if (baselineDirectory) rmSync(baselineDirectory, { recursive: true, force: true });
  });

  it("applies pending release migrations after main, preserves existing rows and runs only once", async () => {
    await migrate(baselineDirectory);
    const history = await database.query<{ name: string }>("SELECT name FROM pgmigrations ORDER BY id");
    expect(history.rows.at(-1)?.name).toBe(MAIN_LAST_MIGRATION.slice(0, -4));
    await database.query("INSERT INTO users (id, email, name, avatar_color, google_sub) VALUES ($1, $2, $3, $4, $5)",
      ["release-owner", "release-owner@example.com", "Release Owner", "#336699", "release-google-sub"]);
    await database.query("INSERT INTO groups (id, name, created_by) VALUES ($1, $2, $3)", ["release-group", "Existing trip", "release-owner"]);
    const before = await database.query("SELECT id, name, created_by, status FROM groups ORDER BY id");

    const applied = await migrate(MIGRATIONS_DIRECTORY);
    expect(applied.map((migration) => migration.name.split("_").slice(1).join("_")))
      .toEqual(RELEASE_SUFFIXES.map((suffix) => suffix.slice(1, -4)));
    const after = await database.query("SELECT id, name, created_by, status FROM groups ORDER BY id");
    expect(after.rows).toEqual(before.rows);
    const owner = await database.query("SELECT google_sub, apple_sub, deleted_at, suspended_at FROM users WHERE id = $1", ["release-owner"]);
    expect(owner.rows).toEqual([{ google_sub: "release-google-sub", apple_sub: null, deleted_at: null, suspended_at: null }]);
    // Existing accounts start never answered (NULL), which is findable by default.
    expect((await database.query("SELECT contact_discovery FROM users WHERE id = $1", ["release-owner"])).rows)
      .toEqual([{ contact_discovery: null }]);
    const tables = await database.query("SELECT to_regclass('apple_credentials') AS apple, to_regclass('content_reports') AS safety, to_regclass('push_outbox') AS push");
    expect(tables.rows).toEqual([{ apple: "apple_credentials", safety: "content_reports", push: "push_outbox" }]);
    expect((await database.query("SELECT * FROM receipt_consents")).rows).toEqual([]);
    await database.query("INSERT INTO users (id, email, name, avatar_color, google_sub) VALUES ('receipt-consent-owner', 'receipt-consent@example.com', 'Scanner', '#336699', 'receipt-consent-google-sub')");
    await database.query("INSERT INTO receipt_consents (user_id, consent_version) VALUES ($1, $2)", ["receipt-consent-owner", "a".repeat(64)]);
    expect((await database.query("SELECT consent_version FROM receipt_consents WHERE user_id = $1", ["receipt-consent-owner"])).rows)
      .toEqual([{ consent_version: "a".repeat(64) }]);
    await database.query("DELETE FROM users WHERE id = $1", ["receipt-consent-owner"]);
    expect((await database.query("SELECT * FROM receipt_consents")).rows).toEqual([]);
    expect(await migrate(MIGRATIONS_DIRECTORY)).toEqual([]);
    const finalHistory = await database.query<{ name: string }>("SELECT name FROM pgmigrations ORDER BY id");
    expect(finalHistory.rows.slice(0, history.rows.length)).toEqual(history.rows);
    expect(finalHistory.rows).toHaveLength(history.rows.length + RELEASE_SUFFIXES.length);
  });
});
