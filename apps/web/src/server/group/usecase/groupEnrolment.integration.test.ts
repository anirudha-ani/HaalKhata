/**
 * Real PostgreSQL regressions: enrolling people in a group
 * takes the same handful of statements however many are added, and two
 * enrolments sharing people never deadlock on their friend-request inboxes.
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FRIEND_REQUEST_INBOX_LOCK_PREFIX, GROUP_ADMISSION_LOCK_PREFIX } from "@/server/common/ledger/ledgerLocks.constants";
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
   * @param count - Number of requests that must be waiting.
   * @returns A promise resolving once there is a waiter or the check holds; throws on timeout.
   */
  async function waitForWaiter(locktype: string, stop: () => boolean = () => false, count = 1): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (stop()) return;
      const waiting = await database.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM pg_locks
          WHERE locktype = $1 AND NOT granted
            AND (database IS NULL OR database = (SELECT oid FROM pg_database WHERE datname = current_database()))`,
        [locktype],
      );
      if (waiting.rows[0].total >= count) return;
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

  /**
   * Seeds the last available seat for a capacity race.
   * @returns When the prospective member already occupies 199 groups.
   */
  async function seedNearCapacity(): Promise<void> {
    await database.query(
      "WITH inserted AS (INSERT INTO groups(id, name, created_by) SELECT 'capacity-' || number, 'Previous group', $1 FROM generate_series(1, 199) AS number RETURNING id) INSERT INTO group_members(group_id, user_id, role) SELECT id, $1, 'owner' FROM inserted",
      [BEN_ID],
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
  it("applies incumbent blocks to direct adds and exempts only existing relationships", async () => {
    const groupId = await groupOwnedBy(ANA_ID);
    await addMembers(ANA_ID, { groupId, userIds: [CARA_ID] });
    const social = await import("@/server/social/usecase/social.usecase");
    const { token } = await social.createGroupInviteLink(ANA_ID, groupId);
    await database.query("INSERT INTO user_blocks(blocker_id, blocked_id) VALUES ($1, $2)", [CARA_ID, BEN_ID]);
    try {
      await expect(addMembers(ANA_ID, { groupId, userIds: [BEN_ID] })).rejects.toMatchObject({ code: "permission_denied" });
      await expect(social.acceptInviteLink(BEN_ID, token)).rejects.toMatchObject({ code: "not_found" });
      expect(await memberIds(groupId)).toEqual([ANA_ID, CARA_ID]);
      await database.query("DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2", [CARA_ID, BEN_ID]);
      await database.query("INSERT INTO user_blocks(blocker_id, blocked_id) VALUES ($1, $2)", [CARA_ID, ANA_ID]);
      await addMembers(ANA_ID, { groupId, userIds: [BEN_ID] });
      expect(await memberIds(groupId)).toEqual([ANA_ID, BEN_ID, CARA_ID]);
    } finally {
      await database.query("DELETE FROM user_blocks WHERE blocker_id = $1", [CARA_ID]);
    }
  });

  it("checks a former inviter as a new member when they try their own group link", async () => {
    const groupId = await groupOwnedBy(ANA_ID);
    await addMembers(ANA_ID, { groupId, userIds: [CARA_ID] });
    const social = await import("@/server/social/usecase/social.usecase");
    const groups = await import("./group.usecase");
    const { token } = await social.createGroupInviteLink(CARA_ID, groupId);
    await groups.removeMemberFromGroup(ANA_ID, { groupId, userId: CARA_ID });
    await database.query("INSERT INTO user_blocks(blocker_id, blocked_id) VALUES ($1, $2)", [ANA_ID, CARA_ID]);
    try {
      await expect(social.acceptInviteLink(CARA_ID, token)).rejects.toMatchObject({ code: "not_found" });
      expect(await memberIds(groupId)).toEqual([ANA_ID]);
    } finally {
      await database.query("DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2", [ANA_ID, CARA_ID]);
    }
  });

  it("refuses a block committed while admission waits for the candidate inbox", async () => {
    const groupId = await groupOwnedBy(ANA_ID);
    await addMembers(ANA_ID, { groupId, userIds: [CARA_ID] });
    await database.query("BEGIN");
    await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [FRIEND_REQUEST_INBOX_LOCK_PREFIX + BEN_ID]);
    const addition = attemptAdd(ANA_ID, groupId, [BEN_ID]);
    try {
      await waitForWaiter("advisory");
      // Commit a block holding the candidate inbox that admission needs.
      await database.query("INSERT INTO user_blocks(blocker_id, blocked_id) VALUES ($1, $2)", [CARA_ID, BEN_ID]);
      await database.query("COMMIT");
      expect(await addition).toMatchObject({ outcome: "failed", error: { code: "permission_denied" } });
      expect(await memberIds(groupId)).toEqual([ANA_ID, CARA_ID]);
    } finally {
      await database.query("ROLLBACK");
      await addition;
      await database.query("DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2", [CARA_ID, BEN_ID]);
    }
  });

  it("shares the last group-capacity seat between creating and accepting a group link", async () => {
    await seedNearCapacity();
    const groupId = await groupOwnedBy(ANA_ID);
    const social = await import("@/server/social/usecase/social.usecase");
    const { createGroup } = await import("./group.usecase");
    const { token } = await social.createGroupInviteLink(ANA_ID, groupId);
    await database.query("BEGIN");
    await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [GROUP_ADMISSION_LOCK_PREFIX + BEN_ID]);
    const creating = createGroup(BEN_ID, { name: "One last group", type: "other", currency: "USD" });
    const joining = social.acceptInviteLink(BEN_ID, token);
    const results = Promise.allSettled([creating, joining]);
    try {
      await waitForWaiter("advisory", () => false, 2);
      await database.query("COMMIT");
      const outcomes = await results;
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((result) => result.status === "rejected")).toEqual([
        expect.objectContaining({ reason: expect.objectContaining({ code: "failed_precondition" }) }),
      ]);
      const seats = await database.query("SELECT count(*)::int AS total FROM group_members WHERE user_id = $1", [BEN_ID]);
      expect(seats.rows[0].total).toBe(200);
    } finally {
      await database.query("ROLLBACK");
      await results;
    }
  });

  it("shares the last capacity seat between direct admissions to different groups", async () => {
    await seedNearCapacity();
    const firstGroup = await groupOwnedBy(ANA_ID);
    const secondGroup = await groupOwnedBy(DEV_ID);
    await database.query("BEGIN");
    await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [GROUP_ADMISSION_LOCK_PREFIX + BEN_ID]);
    const results = Promise.allSettled([
      addMembers(ANA_ID, { groupId: firstGroup, userIds: [BEN_ID] }),
      addMembers(DEV_ID, { groupId: secondGroup, userIds: [BEN_ID] }),
    ]);
    try {
      await waitForWaiter("advisory", () => false, 2);
      await database.query("COMMIT");
      const outcomes = await results;
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const seats = await database.query("SELECT count(*)::int AS total FROM group_members WHERE user_id = $1", [BEN_ID]);
      expect(seats.rows[0].total).toBe(200);
    } finally {
      await database.query("ROLLBACK");
      await results;
    }
  });

  it("requires verified phone ownership for friend requests and direct group admission", async () => {
    const groupId = await groupOwnedBy(ANA_ID);
    const phone = "+12025550184";
    const social = await import("@/server/social/usecase/social.usecase");
    await database.query("UPDATE users SET phone = $2, phone_verified_at = NULL WHERE id = $1", [BEN_ID, phone]);
    try {
      await expect(social.addFriend(ANA_ID, { email: "", phone })).rejects.toMatchObject({ code: "failed_precondition" });
      await expect(addMembers(ANA_ID, { groupId, phone })).rejects.toMatchObject({ code: "failed_precondition" });
      expect(await memberIds(groupId)).toEqual([ANA_ID]);

      await database.query("UPDATE users SET phone_verified_at = now() WHERE id = $1", [BEN_ID]);
      await expect(addMembers(ANA_ID, { groupId, phone })).resolves.toHaveProperty("added");
      expect(await memberIds(groupId)).toEqual([ANA_ID, BEN_ID]);

      await database.query("DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2 OR user_id = $2 AND friend_id = $1", [ANA_ID, BEN_ID]);
      await social.addFriend(ANA_ID, { email: "", phone });
      const pending = await database.query("SELECT 1 FROM friend_requests WHERE requester_id = $1 AND recipient_id = $2", [ANA_ID, BEN_ID]);
      expect(pending.rows).toHaveLength(1);
    } finally {
      await database.query("UPDATE users SET phone = NULL, phone_verified_at = NULL WHERE id = $1", [BEN_ID]);
    }
  });

});
