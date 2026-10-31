/**
 * Real PostgreSQL check that a batch of advisory locks is taken in one
 * statement and in sorted order, whatever order the keys arrive in: the
 * order is what stops two requests from each holding a lock the other needs.
 */

import { Client, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";
import { FRIEND_REQUEST_INBOX_LOCK_PREFIX } from "./ledgerLocks.constants";
import { lockFriendRequestInboxes } from "./ledgerLocks";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_ledger_locks_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

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

describe.skipIf(!reachable)("taking a batch of advisory locks", () => {
  let blocker: Client;
  let subject: Client;

  /**
   * Counts the advisory locks one connection holds or waits for.
   *
   * @param backendId - The connection's backend process id.
   * @param granted - Whether to count held locks (true) or waits (false).
   * @returns How many there are.
   */
  async function advisoryLocks(backendId: number, granted: boolean): Promise<number> {
    const { rows } = await blocker.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM pg_locks WHERE locktype = 'advisory' AND pid = $1 AND granted = $2",
      [backendId, granted],
    );
    return rows[0].total;
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    blocker = new Client({ connectionString: TEST_URL });
    subject = new Client({ connectionString: TEST_URL });
    await Promise.all([blocker.connect(), subject.connect()]);
  }, 60_000);

  afterAll(async () => {
    await blocker?.end();
    await subject?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("takes them in sorted order, in one statement, however they are passed", async () => {
    const { rows } = await subject.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const subjectId = rows[0].pid;
    // Another transaction holds the key that sorts first.
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${FRIEND_REQUEST_INBOX_LOCK_PREFIX}person-a`,
    ]);
    await subject.query("BEGIN");
    const statements = vi.spyOn(subject, "query");
    const locking = lockFriendRequestInboxes(subject as unknown as PoolClient, ["person-c", "person-b", "person-a"]);

    const deadline = Date.now() + 3000;
    while ((await advisoryLocks(subjectId, false)) === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // Waiting on the first key, it holds none of the later ones: in the
    // order given it would already have taken c and b.
    expect(await advisoryLocks(subjectId, false)).toBe(1);
    expect(await advisoryLocks(subjectId, true)).toBe(0);

    await blocker.query("COMMIT");
    await locking;
    expect(await advisoryLocks(subjectId, true)).toBe(3);
    expect(statements).toHaveBeenCalledTimes(1);
    statements.mockRestore();
    await subject.query("COMMIT");
  });

  it("sends nothing when there is nothing to lock", async () => {
    const statements = vi.spyOn(subject, "query");
    await lockFriendRequestInboxes(subject as unknown as PoolClient, ["", ""]);
    expect(statements).not.toHaveBeenCalled();
    statements.mockRestore();
  });
});
