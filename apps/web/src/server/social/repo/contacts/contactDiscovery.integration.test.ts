/**
 * Contact discovery against a real Postgres: who a lookup can match, who a
 * bulk send can reach, the daily quota under concurrent claims, the bulk
 * friend-request insert and the merge's handling of the new columns.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_contacts_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

/** Every number below, keyed by the account that holds it. */
const PHONES = {
  caller: "+16175550100",
  open: "+16175550101",
  unverified: "+16175550102",
  neverAsked: "+16175550103",
  declined: "+16175550104",
  suspended: "+16175550106",
  blocker: "+16175550107",
  blocked: "+16175550108",
  friend: "+16175550109",
  stranger: "+16175550199",
};

/**
 * Checks whether the admin database accepts a connection.
 *
 * @returns True when the suite can run.
 */
async function databaseReachable(): Promise<boolean> {
  const admin = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await admin.connect();
    await admin.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Seeds one account per discovery rule.
 *
 * @param database - Connection to the freshly migrated test database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, name, email, phone, phone_verified_at, avatar_color, google_sub, contact_discovery, suspended_at) VALUES
      ('caller',     'Caller',      'caller@example.com',    $1,  now(), '#c73e2e', 'sub-caller',     TRUE,  NULL),
      ('open',       'Open Phone',  NULL,                    $2,  now(), '#c73e2e', 'sub-open',       TRUE,  NULL),
      ('open-email', 'Open Email',  'Open.Email@Example.com', NULL, NULL, '#c73e2e', 'sub-open-email', TRUE,  NULL),
      ('unverified', 'Unverified',  NULL,                    $3,  NULL,  '#c73e2e', 'sub-unverified', TRUE,  NULL),
      ('never',      'Never Asked', NULL,                    $4,  now(), '#c73e2e', 'sub-never',      NULL,  NULL),
      ('declined',   'Declined',    NULL,                    $5,  now(), '#c73e2e', 'sub-declined',   FALSE, NULL),
      ('suspended',  'Suspended',   NULL,                    $6,  now(), '#c73e2e', 'sub-suspended',  TRUE,  now()),
      ('blocker',    'Blocker',     NULL,                    $7,  now(), '#c73e2e', 'sub-blocker',    TRUE,  NULL),
      ('blocked',    'Blocked',     NULL,                    $8,  now(), '#c73e2e', 'sub-blocked',    TRUE,  NULL),
      ('friend',     'Friend',      NULL,                    $9,  now(), '#c73e2e', 'sub-friend',     TRUE,  NULL),
      ('requested',  'Requested',   'requested@example.com', NULL, NULL, '#c73e2e', 'sub-requested',  TRUE,  NULL),
      ('asker',      'Asker',       'asker@example.com',     NULL, NULL, '#c73e2e', 'sub-asker',      TRUE,  NULL)`,
    [
      PHONES.caller,
      PHONES.open,
      PHONES.unverified,
      PHONES.neverAsked,
      PHONES.declined,
      PHONES.suspended,
      PHONES.blocker,
      PHONES.blocked,
      PHONES.friend,
    ],
  );
  await database.query(
    `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ('blocker', 'caller'), ('caller', 'blocked')`,
  );
  await database.query(
    `INSERT INTO friendships (user_id, friend_id) VALUES ('caller', 'friend'), ('friend', 'caller')`,
  );
  await database.query(
    `INSERT INTO friend_requests (requester_id, recipient_id) VALUES ('caller', 'requested'), ('asker', 'caller')`,
  );
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("contact discovery against Postgres", () => {
  let database: Client;
  let repo: typeof import("./contactDiscovery.repo");
  let friendships: typeof import("../friendships.repo");
  let dbModule: typeof import("@/server/common/db/db");

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    // Set before importing db.ts, which reads DATABASE_URL when it first
    // builds the pool.
    process.env.DATABASE_URL = TEST_URL;
    dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    repo = await import("./contactDiscovery.repo");
    friendships = await import("../friendships.repo");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await seed(database);
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
    await cache.__haalkhataPool?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("matches live, unblocked, registered accounts that did not say no, by verified phone or own email", async () => {
    const matches = await dbModule.transaction((client) =>
      repo.findDiscoverableAccounts(
        "caller",
        Object.values(PHONES),
        [
          "caller@example.com",
          "open.email@example.com",
          "requested@example.com",
          "asker@example.com",
          "nobody@example.com",
        ],
        client,
      ),
    );
    // Never answered is findable by default. Unverified, declined,
    // suspended, both block directions, the caller, the unknown number and
    // the unknown email never match.
    expect(matches.map((match) => match.id)).toEqual([
      "asker",
      "friend",
      "never",
      "open-email",
      "open",
      "requested",
    ]);
  });

  it("reports which identifier matched and how the account relates to the caller", async () => {
    const matches = await dbModule.transaction((client) =>
      repo.findDiscoverableAccounts(
        "caller",
        [PHONES.open, PHONES.friend],
        ["open.email@example.com", "requested@example.com", "asker@example.com"],
        client,
      ),
    );
    const byId = new Map(matches.map((match) => [match.id, match]));
    expect(byId.get("open")).toMatchObject({ matched_phone: PHONES.open, matched_email: null });
    expect(byId.get("open-email")).toMatchObject({
      matched_phone: null,
      matched_email: "open.email@example.com",
    });
    expect(byId.get("friend")).toMatchObject({ is_friend: true, request_sent: false });
    expect(byId.get("requested")).toMatchObject({ request_sent: true, request_received: false });
    expect(byId.get("asker")).toMatchObject({ request_sent: false, request_received: true });
  });

  it("returns nothing for an empty lookup without querying", async () => {
    const matches = await dbModule.transaction((client) =>
      repo.findDiscoverableAccounts("caller", [], [], client),
    );
    expect(matches).toEqual([]);
  });

  it("lets a bulk send reach only findable, registered accounts with no friendship, request or block", async () => {
    const requestable = await repo.findRequestableAccounts("caller", [
      "caller",
      "open",
      "open-email",
      "friend",
      "requested",
      "asker",
      "blocker",
      "blocked",
      "declined",
      "never",
      "suspended",
    ]);
    expect(requestable.map((account) => account.id).sort()).toEqual(["never", "open", "open-email"]);
    expect(await repo.findRequestableAccounts("caller", [])).toEqual([]);
  });

  it("never lets concurrent claims pass the daily limit together", async () => {
    const claims = await Promise.all(
      Array.from({ length: 8 }, () =>
        dbModule.transaction((client) => repo.claimLookupQuota("open", 300, 1000, client)),
      ),
    );
    const granted = claims.filter((total) => total !== undefined);
    expect(granted).toHaveLength(3);
    expect(await repo.readLookupUsage("open")).toBe(900);
    // A claim that would cross the limit counts nothing.
    expect(
      await dbModule.transaction((client) => repo.claimLookupQuota("open", 101, 1000, client)),
    ).toBeUndefined();
    expect(await repo.readLookupUsage("open")).toBe(900);
    expect(
      await dbModule.transaction((client) => repo.claimLookupQuota("open", 100, 1000, client)),
    ).toBe(1000);
  });

  it("refuses a single claim larger than the whole day's limit", async () => {
    expect(
      await dbModule.transaction((client) => repo.claimLookupQuota("never", 1001, 1000, client)),
    ).toBeUndefined();
    expect(await repo.readLookupUsage("never")).toBe(0);
  });

  it("prunes earlier days when the next claim lands", async () => {
    await database.query(
      `INSERT INTO contact_lookup_usage (user_id, usage_day, identifiers_checked)
       VALUES ('declined', (now() AT TIME ZONE 'UTC')::date - 3, 4000)`,
    );
    await dbModule.transaction((client) => repo.claimLookupQuota("declined", 10, 1000, client));
    const { rows } = await database.query(
      `SELECT identifiers_checked FROM contact_lookup_usage WHERE user_id = 'declined'`,
    );
    expect(rows).toEqual([{ identifiers_checked: 10 }]);
  });

  it("inserts one request per new recipient and skips friends, duplicates and pending pairs", async () => {
    const inserted = await dbModule.transaction((client) =>
      friendships.insertFriendRequests(
        "caller",
        ["open", "open", "friend", "requested", "caller", "open-email"],
        client,
      ),
    );
    expect(inserted.sort()).toEqual(["open", "open-email"]);
    const { rows } = await database.query(
      `SELECT recipient_id, recipient_identifier FROM friend_requests
        WHERE requester_id = 'caller' ORDER BY recipient_id`,
    );
    expect(rows).toEqual([
      { recipient_id: "open", recipient_identifier: null },
      { recipient_id: "open-email", recipient_identifier: null },
      { recipient_id: "requested", recipient_identifier: null },
    ]);
  });

  it("holds each recipient's pending cap when senders race for the last slot", async () => {
    const { MAX_PENDING_FRIEND_REQUESTS } = await import("@/server/social/social.constants");
    const earlier = Array.from(
      { length: MAX_PENDING_FRIEND_REQUESTS - 1 },
      (_unusedValue, index) => `cap-${index}`,
    );
    const racers = Array.from({ length: 6 }, (_unusedValue, index) => `racer-${index}`);
    await database.query(
      `INSERT INTO users (id, name, email, avatar_color, google_sub)
       SELECT sender, 'Sender', sender || '@example.com', '#c73e2e', 'sub-' || sender
         FROM unnest($1::text[]) AS sender`,
      [[...earlier, ...racers, "popular"]],
    );
    await database.query(
      `INSERT INTO friend_requests (requester_id, recipient_id)
       SELECT sender, 'popular' FROM unnest($1::text[]) AS sender`,
      [earlier],
    );
    // One slot left and six senders at once: the inbox lock serializes them,
    // so exactly one gets in.
    const outcomes = await Promise.all(
      racers.map((racer) =>
        dbModule.transaction((client) => friendships.insertFriendRequests(racer, ["popular"], client)),
      ),
    );
    expect(outcomes.filter((inserted) => inserted.length === 1)).toHaveLength(1);
    const { rows } = await database.query(
      `SELECT COUNT(*)::int AS pending FROM friend_requests WHERE recipient_id = 'popular'`,
    );
    expect(rows[0].pending).toBe(MAX_PENDING_FRIEND_REQUESTS);
  });

  it("removes the count with the account", async () => {
    await database.query(`DELETE FROM users WHERE id = 'declined'`);
    const { rows } = await database.query(
      `SELECT COUNT(*)::int AS remaining FROM contact_lookup_usage WHERE user_id = 'declined'`,
    );
    expect(rows[0].remaining).toBe(0);
  });
});
