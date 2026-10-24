/**
 * Integration test for two moderation actions racing through two reports
 * about the same content, against a real Postgres.
 *
 * Two people reported the same comment, so it has two open reports. A tab
 * opened before the second report arrived acts through the first; another
 * acts through the second. Each action closes every open report about the
 * comment. If each took only its own report's lock first, each would hold
 * one and wait for the other, and Postgres would fail one with a deadlock:
 * an "internal server error" on the page instead of "already handled".
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { COMMENT_ID, REPORTS, seedModeration } from "./moderationFixtures";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_moderation_locking_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

/** How long to wait for the action to start waiting on a lock, at most. */
const LOCK_WAIT_TIMEOUT_MS = 5_000;

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

describe.skipIf(!(await databaseReachable()))("moderation actions racing on the same content", () => {
  let database: Client;
  let otherTab: Client;

  /**
   * Waits until some session on the test database is waiting for a lock.
   *
   * @throws Error when none starts waiting in time.
   */
  async function untilSomeoneWaitsForALock(): Promise<void> {
    const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { rows } = await database.query<{ waiting: number }>(
        `SELECT COUNT(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (rows[0].waiting > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("the action never waited for the other tab's lock");
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    process.env.DATABASE_URL = TEST_URL;
    await (await import("@/server/common/db/db")).ensureMigrated();
    database = new Client({ connectionString: TEST_URL });
    otherTab = new Client({ connectionString: TEST_URL });
    await database.connect();
    await otherTab.connect();
    await seedModeration(database);
  }, 60_000);

  afterAll(async () => {
    await otherTab?.end();
    await database?.end();
    const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
    await cache.__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("makes the second action wait for the first and report it as already handled", async () => {
    const moderation = await import("./moderation.usecase");

    // The other tab has locked the first report and is about to close every
    // report about the comment, the second one included.
    await otherTab.query("BEGIN");
    await otherTab.query("SELECT id FROM content_reports WHERE id = $1 FOR UPDATE", [REPORTS.commentFirst]);

    const removal = moderation.removeReportedContent(REPORTS.commentSecond).then(
      () => ({ outcome: "removed" as const }),
      (error: unknown) => ({ outcome: "refused" as const, error }),
    );
    await untilSomeoneWaitsForALock();

    // Holding no other report while it waits, the removal leaves the second
    // one free for the other tab to close.
    await otherTab.query(
      `UPDATE content_reports SET status = 'dismissed', resolved_at = now()
        WHERE target_kind = 'comment' AND target_id = $1 AND status = 'open'`,
      [COMMENT_ID],
    );
    await otherTab.query("COMMIT");

    expect(await removal).toMatchObject({
      outcome: "refused",
      error: { code: "failed_precondition" },
    });
    const comment = await database.query("SELECT id FROM comments WHERE id = $1", [COMMENT_ID]);
    expect(comment.rows).toHaveLength(1);
  });
});
