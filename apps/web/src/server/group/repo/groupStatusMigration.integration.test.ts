/** Integration checks for fresh installs, deployed-main upgrades and renamed local group migrations. */

import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { PG_MIGRATE_LOCK_ID, runner } from "node-pg-migrate";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, "/haalkhata_group_status_migration_test");
const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../../../migrations/", import.meta.url));
const ARCHIVE_MIGRATION = "1791828578557_archive_groups";
const STATUS_MIGRATION = "1791828578558_add-group-status";
const LEGACY_ARCHIVE_MIGRATION = "1791244800000_archive_groups";
const LEGACY_TIMESTAMP = 1791244800000;

/**
 * Checks whether the dedicated migration database can be created.
 *
 * @returns True when the configured admin connection is reachable.
 */
async function databaseReachable(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}

/**
 * Applies migrations using the same default order checks as API readiness.
 *
 * @param directory - Migration set to apply.
 * @param timestamp - Optional cutoff for reproducing the older local schema.
 * @returns The migration runner's result.
 */
function migrate(directory: string, timestamp?: number) {
  return runner({
    databaseUrl: TEST_URL,
    dir: directory,
    direction: "up",
    migrationsTable: "pgmigrations",
    count: timestamp,
    timestamp: timestamp !== undefined,
    log: () => undefined,
  });
}

/**
 * Seeds two groups and their owner without relying on a particular lifecycle schema.
 *
 * @param database - Connected dedicated test database.
 * @returns A promise resolving when the fixture is committed.
 */
async function seedGroups(database: Client): Promise<void> {
  await database.query("BEGIN");
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, google_sub)
     VALUES ('group-migration-owner', 'group-migration@example.com', 'Group Owner', '#336699', 'google-group-migration')`,
  );
  await database.query(
    `INSERT INTO groups (id, name, created_by) VALUES
       ('group-active', 'Active group', 'group-migration-owner'),
       ('group-archived', 'Archived group', 'group-migration-owner')`,
  );
  await database.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES
       ('group-active', 'group-migration-owner', 'owner'),
       ('group-archived', 'group-migration-owner', 'owner')`,
  );
  await database.query("COMMIT");
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("group lifecycle migration deployment order", () => {
  let baselineDirectory: string;
  let database: Client;

  beforeAll(() => {
    baselineDirectory = mkdtempSync(join(tmpdir(), "haalkhata-main-migrations-"));
    for (const filename of readdirSync(MIGRATIONS_DIRECTORY)) {
      if (!filename.endsWith(".sql")) continue;
      if (filename === `${ARCHIVE_MIGRATION}.sql` || filename === `${STATUS_MIGRATION}.sql`) continue;
      copyFileSync(join(MIGRATIONS_DIRECTORY, filename), join(baselineDirectory, filename));
    }
  });

  beforeEach(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query("DROP DATABASE IF EXISTS haalkhata_group_status_migration_test WITH (FORCE)");
    await admin.query("CREATE DATABASE haalkhata_group_status_migration_test");
    await admin.end();
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
  });

  afterEach(async () => {
    await database?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query("DROP DATABASE IF EXISTS haalkhata_group_status_migration_test WITH (FORCE)");
    await admin.end();
  });

  afterAll(() => {
    if (baselineDirectory) rmSync(baselineDirectory, { recursive: true, force: true });
  });

  it("applies a fresh install once, with both group migrations last", async () => {
    await migrate(MIGRATIONS_DIRECTORY);
    const before = await database.query<{ name: string }>("SELECT name FROM pgmigrations ORDER BY id");
    expect(before.rows.slice(-2).map((record) => record.name)).toEqual([
      ARCHIVE_MIGRATION, STATUS_MIGRATION,
    ]);
    await migrate(MIGRATIONS_DIRECTORY);
    const after = await database.query<{ name: string }>("SELECT name FROM pgmigrations ORDER BY id");
    expect(after.rows).toEqual(before.rows);
  });

  it("upgrades the deployed-main schema without disabling migration order checks", async () => {
    await migrate(baselineDirectory);
    await seedGroups(database);
    await migrate(MIGRATIONS_DIRECTORY);
    const groups = await database.query<{ id: string; status: string }>(
      "SELECT id, status FROM groups ORDER BY id",
    );
    expect(groups.rows).toEqual([
      { id: "group-active", status: "active" },
      { id: "group-archived", status: "active" },
    ]);
    const migrations = await database.query<{ name: string }>("SELECT name FROM pgmigrations ORDER BY id");
    expect(migrations.rows.slice(-2).map((record) => record.name)).toEqual([
      ARCHIVE_MIGRATION, STATUS_MIGRATION,
    ]);
  });

  it("preserves local archive flags after reconciling the renamed migration record", async () => {
    await migrate(baselineDirectory, LEGACY_TIMESTAMP);
    await seedGroups(database);
    const archiveSQL = readFileSync(join(MIGRATIONS_DIRECTORY, `${ARCHIVE_MIGRATION}.sql`), "utf8")
      .split("-- Down Migration")[0];
    await database.query(archiveSQL);
    await database.query("UPDATE groups SET archived = TRUE WHERE id = 'group-archived'");
    await database.query("INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())", [LEGACY_ARCHIVE_MIGRATION]);
    await expect(migrate(MIGRATIONS_DIRECTORY)).rejects.toThrow(/preceding/);

    // The old local-only name must be released so the new idempotent archive
    // migration is recorded after main. No ledger or archive data is changed.
    await database.query("BEGIN");
    await database.query("SELECT pg_advisory_xact_lock($1)", [PG_MIGRATE_LOCK_ID]);
    await database.query("DELETE FROM pgmigrations WHERE name = $1", [LEGACY_ARCHIVE_MIGRATION]);
    await database.query("COMMIT");
    await migrate(MIGRATIONS_DIRECTORY);
    const groups = await database.query<{ id: string; status: string }>(
      "SELECT id, status FROM groups ORDER BY id",
    );
    expect(groups.rows).toEqual([
      { id: "group-active", status: "active" },
      { id: "group-archived", status: "archived" },
    ]);
    const migrations = await database.query<{ name: string }>("SELECT name FROM pgmigrations ORDER BY id");
    expect(migrations.rows.some((record) => record.name === LEGACY_ARCHIVE_MIGRATION)).toBe(false);
    expect(migrations.rows.slice(-2).map((record) => record.name)).toEqual([
      ARCHIVE_MIGRATION, STATUS_MIGRATION,
    ]);
  });
});
