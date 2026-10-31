/**
 * Real PostgreSQL regression: an AddMembers request that was
 * already waiting for the group's ledger lock when its caller was removed
 * must not run, or a removed member could put themselves straight back.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GROUP_LEDGER_LOCK_PREFIX } from "@/server/common/ledger/ledgerLocks.constants";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_add_members_race_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const OWNER = "race-owner";
const MEMBER = "race-member";
const OUTSIDER = "race-outsider";

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

describe.skipIf(!reachable)("adding members while a removal holds the group lock", () => {
  let database: Client;
  let groupId: string;
  let addMembers: typeof import("./group.usecase").addMembers;
  let closePool: () => Promise<void>;

  /**
   * Waits until a server transaction is queued behind the test's group lock.
   * Reads pg_locks alone: it runs inside the test's open transaction, where
   * pg_stat_activity is a snapshot taken at first use and would never show
   * the add's connection if that opened afterwards.
   *
   * @returns A promise resolving once one is waiting; throws on timeout.
   */
  async function waitForQueuedAdd(): Promise<void> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const waiting = await database.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      if (waiting.rows[0].total >= 1) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("expected an add waiting on the group lock");
  }

  /**
   * Starts an add that passes its first checks and then queues behind a
   * removal holding the group lock, which commits before letting it in.
   *
   * @param userIds - Who the member asks to add.
   * @returns How the queued add ended.
   */
  async function addQueuedBehindRemoval(userIds: string[]) {
    await database.query("BEGIN");
    await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${GROUP_LEDGER_LOCK_PREFIX}${groupId}`,
    ]);
    const queued = addMembers(MEMBER, { groupId, userIds }).then(
      () => ({ outcome: "added" as const }),
      (error: unknown) => ({ outcome: "refused" as const, error }),
    );
    await waitForQueuedAdd();
    // The owner removes the member under the lock the add is waiting for.
    await database.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, MEMBER]);
    await database.query("COMMIT");
    return queued;
  }

  /** @returns The group's member ids, sorted. */
  async function memberIds(): Promise<string[]> {
    const { rows } = await database.query<{ user_id: string }>(
      "SELECT user_id FROM group_members WHERE group_id = $1 ORDER BY user_id",
      [groupId],
    );
    return rows.map((memberRow) => memberRow.user_id);
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
    ({ addMembers } = await import("./group.usecase"));
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, google_sub) VALUES
       ($1, 'race-owner@example.com', 'Rahim', '#336699', 'google-race-owner'),
       ($2, 'race-member@example.com', 'Mallory', '#336699', 'google-race-member'),
       ($3, 'race-outsider@example.com', 'Olivia', '#336699', 'google-race-outsider')`,
      [OWNER, MEMBER, OUTSIDER],
    );
    // Olivia is Mallory's friend, so Mallory may add her while still a member.
    await database.query(
      "INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)",
      [MEMBER, OUTSIDER],
    );
  }, 60_000);

  beforeEach(async () => {
    await database.query("TRUNCATE groups CASCADE");
    groupId = randomUUID();
    await database.query("INSERT INTO groups (id, name, created_by) VALUES ($1, 'Flat 4B', $2)", [groupId, OWNER]);
    await database.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')",
      [groupId, OWNER, MEMBER],
    );
  });

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("refuses a removed member's queued add of themselves, and leaves them out", async () => {
    const result = await addQueuedBehindRemoval([MEMBER]);

    expect(result).toMatchObject({ outcome: "refused", error: { code: "permission_denied" } });
    expect(await memberIds()).toEqual([OWNER]);
  });

  it("refuses a removed member's queued add of somebody else", async () => {
    const result = await addQueuedBehindRemoval([OUTSIDER]);

    expect(result).toMatchObject({ outcome: "refused", error: { code: "permission_denied" } });
    expect(await memberIds()).toEqual([OWNER]);
  });

  it("still adds for a member who stays in the group", async () => {
    await addMembers(MEMBER, { groupId, userIds: [OUTSIDER] });

    expect(await memberIds()).toEqual([OUTSIDER, OWNER, MEMBER].sort());
  });
});
