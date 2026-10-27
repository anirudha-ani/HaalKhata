/**
 * Real PostgreSQL regressions: enrolling people in a group
 * takes the same handful of statements however many are added, and two
 * enrolments sharing people never deadlock on their friend-request inboxes.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_group_enrolment_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
// Ids chosen so their inbox locks sort Ana, Ben, Cara, Dev.
const ANA_ID = "enrol-a-ana";
const BEN_ID = "enrol-b-ben";
const CARA_ID = "enrol-c-cara";
const DEV_ID = "enrol-d-dev";
const CROWD_SIZE = 40;

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

describe.skipIf(!reachable)("enrolling people in a group", () => {
  let database: Client;
  let addMembers: typeof import("./group.usecase").addMembers;
  let closePool: () => Promise<void>;

  /**
   * Creates a group owned by one person, through SQL.
   *
   * @param ownerId - Its owner and only member.
   * @returns The group's id.
   */
  async function groupOwnedBy(ownerId: string): Promise<string> {
    const groupId = randomUUID();
    await database.query("INSERT INTO groups (id, name, created_by) VALUES ($1, 'Trip', $2)", [groupId, ownerId]);
    await database.query("INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')", [
      groupId,
      ownerId,
    ]);
    return groupId;
  }

  /**
   * @param groupId - The group to read.
   * @returns Its member ids, sorted.
   */
  async function memberIds(groupId: string): Promise<string[]> {
    const { rows } = await database.query<{ user_id: string }>(
      "SELECT user_id FROM group_members WHERE group_id = $1 ORDER BY user_id",
      [groupId],
    );
    return rows.map((memberRow) => memberRow.user_id);
  }

  /**
   * Polls until a lock of the given type has a waiter, or the check says to stop.
   *
   * @param locktype - The pg_locks lock type to watch ('advisory', 'transactionid').
   * @param stop - Ends the wait early, e.g. once the request finished without waiting.
   * @returns A promise resolving once there is a waiter or the check holds; throws on timeout.
   */
  async function waitForWaiter(locktype: string, stop: () => boolean = () => false): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (stop()) return;
      const waiting = await database.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM pg_locks
          WHERE locktype = $1 AND NOT granted
            AND (database IS NULL OR database = (SELECT oid FROM pg_database WHERE datname = current_database()))`,
        [locktype],
      );
      if (waiting.rows[0].total >= 1) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`expected a request waiting on a ${locktype} lock`);
  }

  /**
   * Runs an add and records how it ended instead of throwing.
   *
   * @param callerId - Who adds.
   * @param groupId - The group they add to.
   * @param userIds - Who they add, in the order given.
   * @returns How the add ended.
   */
  function attemptAdd(callerId: string, groupId: string, userIds: string[]) {
    return addMembers(callerId, { groupId, userIds }).then(
      () => ({ outcome: "added" as const }),
      (error: unknown) => ({ outcome: "failed" as const, error }),
    );
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
      `INSERT INTO users (id, email, name, avatar_color, google_sub)
       SELECT person.id, person.id || '@example.com', person.name, '#336699', 'google-' || person.id
         FROM (VALUES ($1, 'Ana'), ($2, 'Ben'), ($3, 'Cara'), ($4, 'Dev')) AS person(id, name)
       UNION ALL
       SELECT 'enrol-crowd-' || lpad(number::text, 3, '0'), 'crowd' || number || '@example.com',
              'Guest ' || number, '#336699', 'google-crowd-' || number
         FROM generate_series(1, $5::int) AS number`,
      [ANA_ID, BEN_ID, CARA_ID, DEV_ID, CROWD_SIZE],
    );
  }, 60_000);

  beforeEach(async () => {
    await database.query("TRUNCATE groups, friendships, friend_requests, notifications, push_outbox CASCADE");
    // Ana and Dev may each add Ben and Cara; Ana may add the whole crowd.
    await database.query(
      `INSERT INTO friendships (user_id, friend_id)
       SELECT pair.user_id, pair.friend_id FROM (
         SELECT caller AS user_id, friend AS friend_id
           FROM unnest($1::text[]) AS caller, unnest($2::text[]) AS friend
         UNION ALL
         SELECT $3, id FROM users WHERE id LIKE 'enrol-crowd-%'
       ) AS one_way
       CROSS JOIN LATERAL (VALUES (one_way.user_id, one_way.friend_id), (one_way.friend_id, one_way.user_id))
         AS pair(user_id, friend_id)`,
      [[ANA_ID, DEV_ID], [BEN_ID, CARA_ID], ANA_ID],
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("lets two people add the same friends in opposite orders at the same moment", async () => {
    const anasGroup = await groupOwnedBy(ANA_ID);
    const devsGroup = await groupOwnedBy(DEV_ID);
    // A third connection is part-way through putting Cara in Ana's group,
    // so Ana's add stops there, after Ben, until it lets go.
    await database.query("BEGIN");
    await database.query("INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')", [
      anasGroup,
      CARA_ID,
    ]);
    const anasAdd = attemptAdd(ANA_ID, anasGroup, [BEN_ID, CARA_ID]);
    await waitForWaiter("transactionid");
    // Dev adds the same two people, the other way round, while Ana's add holds what it has.
    let devFinished = false;
    const devsAdd = attemptAdd(DEV_ID, devsGroup, [CARA_ID, BEN_ID]).finally(() => {
      devFinished = true;
    });
    await waitForWaiter("advisory", () => devFinished);
    await database.query("ROLLBACK");

    const [anaResult, devResult] = await Promise.all([anasAdd, devsAdd]);

    expect(anaResult).toEqual({ outcome: "added" });
    expect(devResult).toEqual({ outcome: "added" });
    expect(await memberIds(anasGroup)).toEqual([ANA_ID, BEN_ID, CARA_ID]);
    expect(await memberIds(devsGroup)).toEqual([BEN_ID, CARA_ID, DEV_ID]);
  }, 20_000);

  it("takes as many statements to add forty people as to add three", async () => {
    const { rows: crowd } = await database.query<{ id: string }>(
      "SELECT id FROM users WHERE id LIKE 'enrol-crowd-%' ORDER BY id",
    );
    const crowdIds = crowd.map((person) => person.id);
    const smallGroup = await groupOwnedBy(ANA_ID);
    const largeGroup = await groupOwnedBy(ANA_ID);
    const statements = vi.spyOn(Client.prototype, "query");

    await addMembers(ANA_ID, { groupId: smallGroup, userIds: crowdIds.slice(0, 3) });
    const forThree = statements.mock.calls.length;
    statements.mockClear();
    await addMembers(ANA_ID, { groupId: largeGroup, userIds: crowdIds });
    const forForty = statements.mock.calls.length;
    statements.mockRestore();

    expect(forForty).toBe(forThree);
    expect(await memberIds(largeGroup)).toEqual([...crowdIds, ANA_ID].sort());
  });

  it("befriends the adder with everyone added both ways and clears requests between them", async () => {
    const groupId = await groupOwnedBy(ANA_ID);
    await database.query("DELETE FROM friendships WHERE $1 IN (user_id, friend_id)", [CARA_ID]);
    // Cara cannot be added by a stranger, so connect her through a shared group instead.
    const sharedGroup = await groupOwnedBy(DEV_ID);
    await database.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member'), ($1, $3, 'member')",
      [sharedGroup, ANA_ID, CARA_ID],
    );
    await database.query("INSERT INTO friend_requests (requester_id, recipient_id) VALUES ($1, $2)", [CARA_ID, ANA_ID]);
    await database.query("INSERT INTO friend_requests (requester_id, recipient_id) VALUES ($1, $2)", [ANA_ID, BEN_ID]);

    await addMembers(ANA_ID, { groupId, userIds: [CARA_ID, BEN_ID] });

    const { rows: friendships } = await database.query<{ pair: string }>(
      `SELECT user_id || '>' || friend_id AS pair FROM friendships
        WHERE $1 IN (user_id, friend_id) AND $2 IN (user_id, friend_id) ORDER BY pair`,
      [ANA_ID, CARA_ID],
    );
    expect(friendships.map((friendship) => friendship.pair)).toEqual([`${ANA_ID}>${CARA_ID}`, `${CARA_ID}>${ANA_ID}`]);
    const { rows: requests } = await database.query("SELECT 1 FROM friend_requests");
    expect(requests).toHaveLength(0);
    const { rows: notified } = await database.query<{ user_id: string }>(
      "SELECT user_id FROM notifications WHERE type = 'added_to_group' ORDER BY user_id",
    );
    expect(notified.map((notification) => notification.user_id)).toEqual([BEN_ID, CARA_ID]);
  });
});
