/**
 * FindContacts, SendFriendRequests and SetContactDiscovery end to end on a
 * real Postgres: the usecases with their repos, transactions and quota.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { ContactDiscovery } from "@haalkhata/protogen/common/v1/common_pb";
import { ContactRelation } from "@haalkhata/protogen/social/v1/social_pb";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_contacts_usecase_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const ALICE_PHONE = "+8801712345678";
const STRANGER_PHONE = "+8801812345678";

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

const reachable = await databaseReachable();

describe.skipIf(!reachable)("contacts usecases against Postgres", () => {
  let database: Client;
  let findContacts: typeof import("./findContacts.usecase").findContacts;
  let sendFriendRequests: typeof import("./sendFriendRequests.usecase").sendFriendRequests;
  let setContactDiscovery: typeof import("@/server/auth/usecase/account/contactDiscovery.usecase").setContactDiscovery;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    process.env.DATABASE_URL = TEST_URL;
    await (await import("@/server/common/db/db")).ensureMigrated();
    ({ findContacts } = await import("./findContacts.usecase"));
    ({ sendFriendRequests } = await import("./sendFriendRequests.usecase"));
    ({ setContactDiscovery } = await import("@/server/auth/usecase/account/contactDiscovery.usecase"));

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, name, email, phone, phone_verified_at, avatar_color, google_sub, contact_discovery) VALUES
        ('caller', 'Anirudha', 'caller@example.com', NULL, NULL,  '#c73e2e', 'sub-caller', NULL),
        ('alice',  'Alice',    NULL,                 $1,   now(), '#c73e2e', 'sub-alice',  TRUE),
        ('bob',    'Bob',      'bob@example.com',    NULL, NULL,  '#c73e2e', 'sub-bob',    TRUE),
        ('carol',  'Carol',    'carol@example.com',  NULL, NULL,  '#c73e2e', 'sub-carol',  FALSE),
        ('erin',   'Erin',     'erin@example.com',   NULL, NULL,  '#c73e2e', 'sub-erin',   NULL)`,
      [ALICE_PHONE],
    );
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

  it("finds registered accounts that did not say no, and leaves no trace of the rest", async () => {
    const usersBefore = (await database.query(`SELECT COUNT(*)::int AS total FROM users`)).rows[0].total;
    const result = await findContacts("caller", {
      phones: [ALICE_PHONE, STRANGER_PHONE],
      emails: [
        "bob@example.com",
        "carol@example.com",
        "dora@example.com",
        "erin@example.com",
        "fred@example.com",
        "nobody@example.com",
      ],
    });

    // Erin never answered, which is findable by default. Carol said no. Dora,
    // Fred and nobody have no account at all.
    expect(result.contacts.map((contact) => [contact.identifier, contact.user.id, contact.relation])).toEqual([
      [ALICE_PHONE, "alice", ContactRelation.NONE],
      ["bob@example.com", "bob", ContactRelation.NONE],
      ["erin@example.com", "erin", ContactRelation.NONE],
    ]);
    expect(result.remainingToday).toBe(5000 - 8);
    // A lookup never creates anything for an unknown number.
    expect((await database.query(`SELECT COUNT(*)::int AS total FROM users`)).rows[0].total).toBe(usersBefore);
    expect(
      (await database.query(`SELECT COUNT(*)::int AS total FROM users WHERE phone = $1`, [STRANGER_PHONE])).rows[0].total,
    ).toBe(0);
    expect((await database.query(`SELECT user_id, identifiers_checked FROM contact_lookup_usage`)).rows).toEqual([
      { user_id: "caller", identifiers_checked: 8 },
    ]);
  });

  it("sends requests with notifications to findable accounts only", async () => {
    // Dora and Fred name no account; nothing is sent or made for them.
    await sendFriendRequests("caller", ["alice", "bob", "carol", "dora", "fred"]);

    const requests = await database.query(
      `SELECT recipient_id, recipient_identifier FROM friend_requests WHERE requester_id = 'caller' ORDER BY recipient_id`,
    );
    expect(requests.rows).toEqual([
      { recipient_id: "alice", recipient_identifier: null },
      { recipient_id: "bob", recipient_identifier: null },
    ]);
    const notifications = await database.query(
      `SELECT user_id, type, title, actor_id FROM notifications ORDER BY user_id`,
    );
    expect(notifications.rows).toEqual([
      { user_id: "alice", type: "friend_request", title: "Anirudha sent you a friend request", actor_id: "caller" },
      { user_id: "bob", type: "friend_request", title: "Anirudha sent you a friend request", actor_id: "caller" },
    ]);
  });

  it("reports sent requests as REQUESTED and is safe to repeat", async () => {
    await sendFriendRequests("caller", ["alice"]);
    expect(
      (await database.query(`SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = 'alice'`)).rows[0].total,
    ).toBe(1);
    const result = await findContacts("caller", { phones: [ALICE_PHONE], emails: [] });
    expect(result.contacts.map((contact) => contact.relation)).toEqual([ContactRelation.REQUESTED]);
  });

  it("stops matching someone the moment they turn discovery off", async () => {
    const profile = await setContactDiscovery("alice", false);
    expect(profile.contactDiscovery).toBe(ContactDiscovery.OFF);
    const result = await findContacts("caller", { phones: [ALICE_PHONE], emails: [] });
    expect(result.contacts).toEqual([]);
    expect((await setContactDiscovery("caller", true)).contactDiscovery).toBe(ContactDiscovery.ON);
  });

  it("refuses a lookup past the daily allowance and counts nothing", async () => {
    await database.query(
      `UPDATE contact_lookup_usage SET identifiers_checked = 4999 WHERE user_id = 'caller'`,
    );
    await expect(
      findContacts("caller", { phones: [ALICE_PHONE], emails: ["bob@example.com"] }),
    ).rejects.toMatchObject({ code: "resource_exhausted", message: expect.stringContaining("1 more contact today") });
    expect(
      (await database.query(`SELECT identifiers_checked FROM contact_lookup_usage WHERE user_id = 'caller'`)).rows,
    ).toEqual([{ identifiers_checked: 4999 }]);
  });
});
