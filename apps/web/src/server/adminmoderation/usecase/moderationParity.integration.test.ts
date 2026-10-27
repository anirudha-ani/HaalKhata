/**
 * Proves the admin page and ops/moderate.sh remove content the same way.
 *
 * The page's removal is written in TypeScript with parameters; the script's
 * is safety/repo/moderation.sql, run by psql. Two databases get the same
 * seed, each removal runs through the page on one and through the script on
 * the other, and everything a removal can touch must end up identical. A
 * change to one of the two that the other does not make fails here.
 *
 * Needs psql, as main's safety suite does: either the Postgres container CI
 * already runs (MODERATION_TEST_CONTAINER, the same variable that suite
 * reads) or a psql binary (MODERATION_TEST_PSQL). Skips itself otherwise.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { REPORTS, contentState, seedModeration } from "./moderationFixtures";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const PAGE_DATABASE = testDatabaseName("haalkhata_moderation_page_test");
const SCRIPT_DATABASE = testDatabaseName("haalkhata_moderation_script_test");
const MODERATION_CONTAINER = process.env.MODERATION_TEST_CONTAINER;
const PSQL = process.env.MODERATION_TEST_PSQL;

/** The removals compared, one per kind of content. */
const REMOVALS = [REPORTS.commentFirst, REPORTS.expense, REPORTS.group, REPORTS.profile];

/**
 * @param databaseName - Database on the test server.
 * @returns Its connection URL.
 */
function urlFor(databaseName: string): string {
  return ADMIN_URL.replace(/\/[^/]*$/, `/${databaseName}`);
}

/**
 * Runs moderation.sql exactly as ops/moderate.sh does: the file on stdin,
 * the action and report as psql variables.
 *
 * @param action - The moderation action.
 * @param reportId - The report to act through.
 */
function runModerationSql(action: string, reportId: string): void {
  const input = readFileSync(new URL("../../safety/repo/moderation.sql", import.meta.url));
  const variables = ["-v", "ON_ERROR_STOP=1", "-v", `action=${action}`, "-v", `report_id=${reportId}`];
  if (MODERATION_CONTAINER) {
    execFileSync(
      "docker",
      ["exec", "-i", MODERATION_CONTAINER, "psql", "-U", "haalkhata", "-d", SCRIPT_DATABASE, ...variables],
      { input, stdio: ["pipe", "pipe", "pipe"] },
    );
    return;
  }
  execFileSync(PSQL!, ["-d", urlFor(SCRIPT_DATABASE), ...variables], {
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * Checks whether the admin database accepts a connection.
 *
 * @returns True when the suite can run.
 */
async function databaseReachable(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const runnable = Boolean(MODERATION_CONTAINER || PSQL) && (await databaseReachable());

describe.skipIf(!runnable)("removal through the admin page matches moderation.sql", () => {
  let pageDatabase: Client;
  let scriptDatabase: Client;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    for (const name of [PAGE_DATABASE, SCRIPT_DATABASE]) {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${name}`);
    }
    await admin.end();
    const { runner } = await import("node-pg-migrate");
    const migrations = new URL("../../../../migrations/", import.meta.url).pathname;
    for (const name of [PAGE_DATABASE, SCRIPT_DATABASE]) {
      await runner({
        databaseUrl: urlFor(name),
        dir: migrations,
        direction: "up",
        migrationsTable: "pgmigrations",
        log: () => undefined,
      });
    }
    process.env.DATABASE_URL = urlFor(PAGE_DATABASE);
    pageDatabase = new Client({ connectionString: urlFor(PAGE_DATABASE) });
    scriptDatabase = new Client({ connectionString: urlFor(SCRIPT_DATABASE) });
    await pageDatabase.connect();
    await scriptDatabase.connect();
    await seedModeration(pageDatabase);
    await seedModeration(scriptDatabase);
  }, 120_000);

  afterAll(async () => {
    await pageDatabase?.end();
    await scriptDatabase?.end();
    const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
    await cache.__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    for (const name of [PAGE_DATABASE, SCRIPT_DATABASE]) {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    await admin.end();
  });

  it("leaves the same content, quotations and money behind for every kind", async () => {
    const moderation = await import("./moderation.usecase");
    expect(await contentState(pageDatabase)).toEqual(await contentState(scriptDatabase));

    for (const reportId of REMOVALS) {
      await moderation.removeReportedContent(reportId);
      runModerationSql("remove", reportId);
      expect(await contentState(pageDatabase)).toEqual(await contentState(scriptDatabase));
    }
  });

  it("suspends and resumes the same way", async () => {
    const moderation = await import("./moderation.usecase");
    const standing = (database: Client) =>
      database.query("SELECT id, suspended_at IS NOT NULL AS suspended, token_version FROM users ORDER BY id");

    await moderation.suspendAuthor(REPORTS.profile);
    runModerationSql("suspend", REPORTS.profile);
    expect((await standing(pageDatabase)).rows).toEqual((await standing(scriptDatabase)).rows);

    await moderation.resumeAuthor(REPORTS.profile);
    runModerationSql("resume", REPORTS.profile);
    expect((await standing(pageDatabase)).rows).toEqual((await standing(scriptDatabase)).rows);
  });
});
