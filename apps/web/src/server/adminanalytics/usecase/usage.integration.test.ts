/**
 * Integration test for the usage overview and admin sessions, against a real
 * Postgres.
 *
 * Two properties here cannot be shown with mocks. One is that the counts are
 * right: registered people apart from invited placeholders and merge
 * tombstones, deleted expenses still counted as added, each person credited
 * with what they did. The other is the promise the admin page is built on:
 * that the overview carries names and counts and nothing else. The suite
 * seeds people with emails, phone numbers, pictures, amounts, descriptions,
 * group names and payment methods, then searches the entire response for
 * every one of them.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_usage_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const EMAIL_AS_NAME = "user-emailname-3b1c";
const PHONE_AS_NAME = "user-phonename-8d2e";
const LOCAL_PART_AS_NAME = "user-localpart-4f6a";
const ANIKA = "user-anika-7f3a";
const RIFAT = "user-rifat-91bc";
const LATECOMER = "user-latecomer-2d4e";
const INVITED = "user-invited-55aa";
const TOMBSTONE = "user-tombstone-0c0c";

/** Everything seeded that the overview must never contain. */
const PRIVATE_VALUES = [
  ANIKA,
  RIFAT,
  LATECOMER,
  INVITED,
  TOMBSTONE,
  "anika.private@example.com",
  "rifat.private@example.com",
  "latecomer.private@example.com",
  "invited.private@example.com",
  "+14155550101",
  "https://lh3.googleusercontent.com/secret-picture",
  "google-sub-anika",
  "Secret Dinner Description",
  "Hidden Group Name",
  "Private comment body",
  "Invited Placeholder",
  "987654",
  "typed.my.email@example.com",
  "+1 (415) 555-0199",
  "jsmith1987",
  "Secret Bank Method",
  "secret-venmo-handle",
  "Routing 021000021",
  "Pay me before Friday",
  "Label Kept On Payment",
];

/**
 * Checks whether the admin database accepts a connection.
 *
 * @returns True when the suite can run.
 */
async function databaseReachable(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Seeds three people who signed in, one invited placeholder, one merge
 * tombstone, and a spread of what they did.
 *
 * @param database - Connected client on the test database.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users
       (id, email, phone, name, avatar_color, avatar_url, google_sub, password_hash, onboarded_at, created_at)
     VALUES
       ($1, 'anika.private@example.com', '+14155550101', 'Anika Rahman', '#0f8a5f',
        'https://lh3.googleusercontent.com/secret-picture', 'google-sub-anika', NULL,
        now() - interval '40 days', now() - interval '200 days'),
       ($2, 'rifat.private@example.com', NULL, 'Rifat Khan', '#1d4ed8', NULL, NULL, 'salt:hash',
        now() - interval '10 days', now() - interval '10 days'),
       ($3, 'latecomer.private@example.com', NULL, 'Late Comer', '#7c3aed', NULL, 'google-sub-late', NULL,
        now() - interval '1 hour', now() - interval '1 hour'),
       ($4, 'invited.private@example.com', NULL, 'Invited Placeholder', '#857a68', NULL, NULL, NULL,
        NULL, now() - interval '3 days')`,
    [ANIKA, RIFAT, LATECOMER, INVITED],
  );
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, google_sub, merged_into, created_at)
     VALUES ($1, NULL, 'Merged Away', '#857a68', NULL, $2, now() - interval '5 days')`,
    [TOMBSTONE, ANIKA],
  );

  // Three people whose display name is itself a way to reach them. They
  // joined long ago, so they sort last and stay out of the other checks.
  await database.query(
    `INSERT INTO users (id, email, name, avatar_color, google_sub, onboarded_at, created_at) VALUES
       ($1, 'a.private@example.com', 'typed.my.email@example.com', '#857a68', 'google-sub-e',
        now() - interval '400 days', now() - interval '400 days'),
       ($2, 'b.private@example.com', '+1 (415) 555-0199', '#857a68', 'google-sub-p',
        now() - interval '401 days', now() - interval '401 days'),
       ($3, 'jsmith1987@example.com', 'JSmith1987', '#857a68', 'google-sub-l',
        now() - interval '402 days', now() - interval '402 days')`,
    [EMAIL_AS_NAME, PHONE_AS_NAME, LOCAL_PART_AS_NAME],
  );

  await database.query(
    `INSERT INTO groups (id, name, type, created_by) VALUES
       ('grp-1', 'Hidden Group Name', 'trip', $1), ('grp-2', 'Another Group', 'home', $2)`,
    [ANIKA, RIFAT],
  );

  // Five expenses: three equal (one since deleted), one itemized, one shares.
  await database.query(
    `INSERT INTO expenses
       (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by,
        created_at, deleted_at, deleted_by)
     VALUES
       ('exp-1', 'grp-1', 'Secret Dinner Description', 987654, 'USD', '2026-10-01', 'equal', $1, now(), NULL, NULL),
       ('exp-2', 'grp-1', 'two', 1000, 'USD', '2026-10-01', 'equal', $1, now() - interval '9 days', NULL, NULL),
       ('exp-3', NULL, 'three', 1000, 'USD', '2026-10-01', 'itemized', $1, now() - interval '9 days', NULL, NULL),
       ('exp-4', NULL, 'four', 1000, 'USD', '2026-10-01', 'equal', $2, now() - interval '100 days', now(), $2),
       ('exp-5', 'grp-2', 'five', 1000, 'USD', '2026-10-01', 'shares', $2, now(), NULL, NULL)`,
    [ANIKA, RIFAT],
  );

  await database.query(
    `INSERT INTO settlements (id, from_user, to_user, amount_cents, currency, method, recorded_by, created_at)
     VALUES ('stl-1', $1, $2, 500, 'USD', 'venmo', $1, now()),
            ('stl-2', $2, $1, 300, 'USD', 'cash', $1, now() - interval '9 days'),
            ('stl-3', $2, $1, 200, 'USD', 'cash', $2, now() - interval '200 days')`,
    [ANIKA, RIFAT],
  );
  // Anika has saved two payment methods and Rifat one; one of Anika's
  // payments also kept the name of the method it was made with.
  await database.query(
    `INSERT INTO payment_methods (id, user_id, name, currency, preset, note) VALUES
       ('pm-1', $1, 'Venmo', 'USD', 'venmo', 'Pay me before Friday'),
       ('pm-2', $1, 'Secret Bank Method', NULL, NULL, ''),
       ('pm-3', $2, 'Zelle', 'USD', 'zelle', '')`,
    [ANIKA, RIFAT],
  );
  await database.query(
    `INSERT INTO payment_method_details (method_id, position, kind, label, value) VALUES
       ('pm-1', 0, 'username', '', 'secret-venmo-handle'),
       ('pm-2', 0, 'custom', 'Routing', 'Routing 021000021'),
       ('pm-3', 0, 'email', '', 'rifat.private@example.com')`,
  );
  await database.query(
    `UPDATE settlements SET method_label = 'Label Kept On Payment' WHERE id = 'stl-1'`,
  );

  await database.query(
    `INSERT INTO comments (id, expense_id, user_id, body) VALUES
       ('cmt-1', 'exp-1', $1, 'Private comment body'), ('cmt-2', 'exp-1', $2, 'another')`,
    [ANIKA, RIFAT],
  );
  await database.query(
    `INSERT INTO receipt_scans (id, user_id, outcome, created_at) VALUES
       ('scan-1', $1, 'parsed', now()), ('scan-2', $1, 'failed', now()),
       ('scan-3', $1, 'parsed', now() - interval '9 days'), ('scan-4', $2, 'parsed', now())`,
    [ANIKA, RIFAT],
  );
  // Anika acted today, Rifat nine days ago, the latecomer never.
  await database.query(
    `INSERT INTO activity (id, group_id, actor_id, type, message, audience, created_at) VALUES
       ('act-1', NULL, $1, 'expense_added', 'x', '[]'::jsonb, now()),
       ('act-2', NULL, $1, 'expense_added', 'x', '[]'::jsonb, now() - interval '2 days'),
       ('act-3', NULL, $2, 'expense_added', 'x', '[]'::jsonb, now() - interval '9 days'),
       ('act-4', NULL, $2, 'expense_added', 'x', '[]'::jsonb, now() - interval '90 days')`,
    [ANIKA, RIFAT],
  );
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("usage overview against Postgres", () => {
  let database: Client;
  let getUsageOverview: typeof import("./usage.usecase").getUsageOverview;
  let sessions: typeof import("@/server/adminanalytics/repo/adminSessions.repo");
  let closePool: () => Promise<void>;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    // Set before importing db.ts, which reads DATABASE_URL when it first
    // builds the pool.
    process.env.DATABASE_URL = TEST_URL;
    const dbModule = await import("@/server/common/db/db");
    await dbModule.ensureMigrated();
    closePool = async () => {
      const cache = globalThis as unknown as { __haalkhataPool?: { end(): Promise<void> } };
      await cache.__haalkhataPool?.end();
    };
    ({ getUsageOverview } = await import("./usage.usecase"));
    sessions = await import("@/server/adminanalytics/repo/adminSessions.repo");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await seed(database);
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("counts people who signed in apart from placeholders and merge tombstones", async () => {
    const { totals } = await getUsageOverview();

    // Anika, Rifat, the latecomer, and the three whose names are withheld.
    expect(totals.registeredUserCount).toBe(6);
    expect(totals.invitedUserCount).toBe(1);
  });

  it("counts an Apple sign-in as registered and a deleted account's stand-in as nobody", async () => {
    // Account deletion leaves an identity-free row behind to hold the
    // deleted person's share of shared ledgers: no sign-in, deleted_at set.
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, apple_sub, onboarded_at, created_at, deleted_at) VALUES
         ('user-apple-1', 'relay.private@privaterelay.appleid.com', 'Apple Person', '#857a68', 'apple-sub-1',
          now() - interval '300 days', now() - interval '300 days', NULL),
         ('user-standin-1', NULL, 'Deleted member', '#857a68', NULL, NULL, now() - interval '2 days', now())`,
    );
    try {
      const { totals, users } = await getUsageOverview();
      expect(totals.registeredUserCount).toBe(7);
      expect(totals.invitedUserCount).toBe(1);
      expect(users.map((person) => person.name)).toContain("Apple Person");
      expect(users.map((person) => person.name)).not.toContain("Deleted member");
    } finally {
      await database.query(`DELETE FROM users WHERE id IN ('user-apple-1', 'user-standin-1')`);
    }
  });

  it("counts activity by its window, one person once", async () => {
    const { totals } = await getUsageOverview();

    expect(totals.weeklyActiveUserCount).toBe(1);
    expect(totals.monthlyActiveUserCount).toBe(2);
  });

  it("counts everything that was ever added, deleted expenses included", async () => {
    const { totals, expensesBySplitType } = await getUsageOverview();

    expect(totals).toMatchObject({
      groupCount: 2,
      expenseCount: 5,
      deletedExpenseCount: 1,
      paymentCount: 3,
      receiptScanCount: 4,
      parsedReceiptScanCount: 3,
      commentCount: 2,
      paymentMethodCount: 3,
      paymentMethodUserCount: 2,
    });
    expect(expensesBySplitType).toEqual([
      { splitType: "equal", count: 3 },
      { splitType: "itemized", count: 1 },
      { splitType: "shares", count: 1 },
    ]);
  });

  it("lists each person who signed in, newest first, with what they did", async () => {
    const { users, usersTruncated } = await getUsageOverview();

    expect(usersTruncated).toBe(false);
    expect(users.slice(0, 3).map((person) => person.name)).toEqual([
      "Late Comer",
      "Rifat Khan",
      "Anika Rahman",
    ]);
    expect(users[0]).toMatchObject({
      expensesBySplitType: [],
      paymentCount: 0,
      receiptScanCount: 0,
    });
    expect(users[1]).toMatchObject({
      expensesBySplitType: [
        { splitType: "equal", count: 1 },
        { splitType: "shares", count: 1 },
      ],
      paymentCount: 1,
      receiptScanCount: 1,
    });
    expect(users[2]).toMatchObject({
      expensesBySplitType: [
        { splitType: "equal", count: 2 },
        { splitType: "itemized", count: 1 },
      ],
      paymentCount: 2,
      receiptScanCount: 3,
    });
  });

  it("dates someone from when they joined, not from when a friend first invited them", async () => {
    const { users } = await getUsageOverview();
    // Read back from the row rather than recomputed from the clock, so the
    // check cannot straddle a midnight between the seed and the assertion.
    const { rows } = await database.query(
      `SELECT to_char(onboarded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS onboarded_on,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS created_on
         FROM users WHERE id = $1`,
      [ANIKA],
    );

    // Anika's row is 200 days old; she finished signing up 40 days ago.
    expect(users[2].joinedOn).toBe(rows[0].onboarded_on);
    expect(users[2].joinedOn).not.toBe(rows[0].created_on);
  });

  it("returns twelve whole weeks, with this week's activity in the last one", async () => {
    const { weeks } = await getUsageOverview();

    expect(weeks).toHaveLength(12);
    for (const week of weeks) {
      expect(new Date(`${week.weekStart}T00:00:00Z`).getUTCDay()).toBe(1);
    }
    const totalOf = (pick: (week: (typeof weeks)[number]) => number) =>
      weeks.reduce((total, week) => total + pick(week), 0);
    // Within twelve weeks: the three recent sign-ups; four of five expenses (one is
    // 100 days old); two of three payments (one is 200 days old); all scans.
    expect(totalOf((week) => week.newUserCount)).toBe(3);
    expect(totalOf((week) => week.expenseCount)).toBe(4);
    expect(totalOf((week) => week.paymentCount)).toBe(2);
    expect(totalOf((week) => week.receiptScanCount)).toBe(4);
  });

  it("files a count under the week the database says it happened in", async () => {
    const { weeks } = await getUsageOverview();
    // The latecomer's own week, as Postgres truncates it, so the check holds
    // in the first hour of a Monday too.
    const { rows } = await database.query(
      `SELECT to_char(date_trunc('week', onboarded_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week_start
         FROM users WHERE id = $1`,
      [LATECOMER],
    );

    const joinedWeek = weeks.find((week) => week.weekStart === rows[0].week_start);
    expect(joinedWeek?.newUserCount).toBeGreaterThanOrEqual(1);
  });

  it("withholds a display name that is really an email, a phone number, or the start of the email", async () => {
    const { users } = await getUsageOverview();

    // Still counted and still listed, so the totals and the table agree;
    // only the name is gone.
    expect(users).toHaveLength(6);
    expect(users.slice(3).map((person) => person.name)).toEqual(["", "", ""]);
  });

  it("does not withhold an ordinary name that merely contains digits or punctuation", async () => {
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, google_sub, onboarded_at, created_at) VALUES
         ('user-plain-1', 'c.private@example.com', 'Mary-Jane O''Neil 2nd', '#857a68', 'google-sub-m',
          now() - interval '500 days', now() - interval '500 days')`,
    );
    try {
      const { users } = await getUsageOverview();
      expect(users[users.length - 1].name).toBe("Mary-Jane O'Neil 2nd");
    } finally {
      await database.query(`DELETE FROM users WHERE id = 'user-plain-1'`);
    }
  });

  it("carries names and counts and nothing else a person would call private", async () => {
    const overview = JSON.stringify(await getUsageOverview());

    for (const privateValue of PRIVATE_VALUES) {
      expect(overview).not.toContain(privateValue);
    }
    // The three people who signed in are named; that is the whole of it.
    expect(overview).toContain("Anika Rahman");
    expect(overview).not.toContain("Merged Away");
    expect(overview).not.toMatch(/@/);
  });

  describe("admin sessions", () => {
    const LIVE_HASH = "a".repeat(64);
    const SHORT_HASH = "b".repeat(64);

    it("finds a live session and not an unknown one", async () => {
      await sessions.insertAdminSession(LIVE_HASH, "operator@example.com", 3600);

      await expect(sessions.findAdminSession(LIVE_HASH)).resolves.toEqual({
        email: "operator@example.com",
      });
      await expect(sessions.findAdminSession("c".repeat(64))).resolves.toBeUndefined();
    });

    it("stops finding a session the moment it expires", async () => {
      await sessions.insertAdminSession(SHORT_HASH, "operator@example.com", 3600);
      await database.query(
        `UPDATE admin_sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1`,
        [SHORT_HASH],
      );

      await expect(sessions.findAdminSession(SHORT_HASH)).resolves.toBeUndefined();
    });

    it("purges expired sessions when the next one starts", async () => {
      await sessions.insertAdminSession("d".repeat(64), "operator@example.com", 3600);

      const { rows } = await database.query(
        `SELECT COUNT(*)::int AS expired FROM admin_sessions WHERE expires_at <= now()`,
      );
      expect(rows[0].expired).toBe(0);
    });

    it("ends a session on sign-out, and ending it twice is not an error", async () => {
      await sessions.deleteAdminSession(LIVE_HASH);
      await sessions.deleteAdminSession(LIVE_HASH);

      await expect(sessions.findAdminSession(LIVE_HASH)).resolves.toBeUndefined();
    });

    it("refuses to store anything that is not a SHA-256 digest", async () => {
      await expect(
        sessions.insertAdminSession("raw-token-not-a-digest", "operator@example.com", 3600),
      ).rejects.toThrow(/chk_admin_sessions_token_hash/);
    });
  });
});
