/**
 * Integration test for the migration that retires every row that is not a
 * signed-in person, run against a real Postgres.
 *
 * The harness migrates to just before it, seeds the rows earlier releases
 * could leave behind (a placeholder with only friendships and a seat, a
 * placeholder from before the 2026-09 rules that holds money, a merge
 * tombstone, one-person invite links to claim them), then applies it. The
 * money must not move, the placeholders must be gone or anonymous, and the
 * database must refuse to hold one again.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { runner } from "node-pg-migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_retire_unregistered_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);
const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../../../migrations/", import.meta.url));
const MIGRATION_FILE = "1793040072450_retire-unregistered-people.sql";

/** People who signed in, one per credential. */
const ALICE = "user-alice";
const BOBBY = "user-bob";
const CAROL = "user-carol";
/** Typed into Add friend by Alice; holds a friendship and a group seat, no money. */
const FRIEND_ONLY = "placeholder-friend-only";
/** Added to a group and an expense before the 2026-09 rules; holds money. */
const LEGACY = "placeholder-legacy";
/** A placeholder already absorbed into Alice by an earlier merge. */
const TOMBSTONE = "tombstone-merged";
/** The stand-in an earlier account deletion left; already anonymous. */
const STAND_IN = "stand-in-deleted";
const GROUP = "group-goa";

/** A token of the shape invite_links accepts, distinct per letter. */
const token = (letter: string) => letter.repeat(43);

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
 * Applies a set of migrations with the startup runner's settings.
 *
 * @param directory - Migration files to apply.
 * @param direction - Up to apply, down to roll the newest back.
 * @param count - How many to apply; every pending one when omitted.
 * @returns The migrations that ran.
 */
function migrate(directory: string, direction: "up" | "down" = "up", count?: number) {
  return runner({
    databaseUrl: TEST_URL,
    dir: directory,
    direction,
    count,
    migrationsTable: "pgmigrations",
    log: () => undefined,
  });
}

/**
 * Seeds what earlier releases could leave: real accounts, placeholders with
 * and without money, a tombstone, and the links that claimed them.
 *
 * @param database - Connection to the database, migrated to just before the change.
 */
async function seed(database: Client): Promise<void> {
  await database.query(
    `INSERT INTO users (id, email, phone, name, avatar_color, google_sub, apple_sub, password_hash) VALUES
       ($1, 'alice@example.com', NULL, 'Alice', '#0f8a5f', 'google-alice', NULL, NULL),
       ($2, 'bobby@privaterelay.appleid.com', NULL, 'Bobby', '#1d4ed8', NULL, 'apple-bobby', NULL),
       ($3, 'carol@example.com', NULL, 'Carol', '#7c3aed', NULL, NULL, 'salt:hash'),
       ($4, 'rifat@example.com', '+8801712345678', 'Rifat', '#857a68', NULL, NULL, NULL),
       ($5, 'tanvir@example.com', NULL, 'Tanvir', '#857a68', NULL, NULL, NULL)`,
    [ALICE, BOBBY, CAROL, FRIEND_ONLY, LEGACY],
  );
  await database.query(
    `INSERT INTO users (id, name, avatar_color, merged_into) VALUES ($1, 'Merged Away', '#857a68', $2)`,
    [TOMBSTONE, ALICE],
  );
  await database.query(
    `INSERT INTO users (id, name, avatar_color, deleted_at) VALUES ($1, 'Deleted member', '#6b7280', now())`,
    [STAND_IN],
  );
  await database.query(
    `INSERT INTO friendships (user_id, friend_id) VALUES
       ($1, $2), ($2, $1), ($1, $3), ($3, $1), ($1, $4), ($4, $1)`,
    [ALICE, FRIEND_ONLY, LEGACY, CAROL],
  );
  await database.query(`INSERT INTO groups (id, name, created_by) VALUES ($1, 'Goa Trip', $2)`, [GROUP, ALICE]);
  await database.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES
       ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member'), ($1, $5, 'member')`,
    [GROUP, ALICE, FRIEND_ONLY, LEGACY, STAND_IN],
  );
  // Alice paid 30.00; Tanvir (legacy placeholder) and the stand-in owe 10.00 each.
  await database.query(
    `INSERT INTO expenses (id, group_id, description, amount_cents, currency, expense_date, split_type, created_by)
     VALUES ('expense-hotel', $1, 'Hotel', 3000, 'USD', '2026-08-01', 'equal', $2)`,
    [GROUP, ALICE],
  );
  await database.query(
    `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ('expense-hotel', $1, 3000)`,
    [ALICE],
  );
  await database.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES
       ('expense-hotel', $1, 1000), ('expense-hotel', $2, 1000), ('expense-hotel', $3, 1000)`,
    [ALICE, LEGACY, STAND_IN],
  );
  await database.query(
    `INSERT INTO invite_links (token, kind, inviter_id, group_id, invited_user_id, revoked_at) VALUES
       ($1, 'friend', $5, NULL, $6, NULL),
       ($2, 'friend', $5, NULL, $7, NULL),
       ($3, 'friend', $5, NULL, $8, now()),
       ($4, 'group', $5, $9, NULL, NULL),
       ($10, 'profile', $5, NULL, NULL, NULL)`,
    [token("a"), token("b"), token("c"), token("d"), ALICE, FRIEND_ONLY, LEGACY, TOMBSTONE, GROUP, token("e")],
  );
  await database.query(
    `INSERT INTO activity (id, group_id, actor_id, type, message, audience, link) VALUES
       ('activity-added', $1, $2, 'member_added', 'Alice added Rifat and Tanvir', jsonb_build_array($2::text, $3::text, $4::text), '/groups/group-goa')`,
    [GROUP, ALICE, FRIEND_ONLY, LEGACY],
  );
  await database.query(
    `INSERT INTO notifications (id, user_id, type, title, body, link) VALUES
       ('note-placeholder', $1, 'member_added', 'Alice added you to "Goa Trip"', '', '/groups/group-goa'),
       ('note-alice', $2, 'expense_added', 'Hotel', '', '/groups/group-goa')`,
    [FRIEND_ONLY, ALICE],
  );
}

/**
 * Every payer and split row, so the ledger can be compared across the migration.
 *
 * @param database - Connection to the test database.
 * @returns The rows, in a stable order.
 */
async function ledgerRows(database: Client) {
  const payers = await database.query(
    `SELECT expense_id, user_id, amount_cents FROM expense_payers ORDER BY expense_id, user_id`,
  );
  const splits = await database.query(
    `SELECT expense_id, user_id, owed_cents FROM expense_splits ORDER BY expense_id, user_id`,
  );
  return { payers: payers.rows, splits: splits.rows };
}

describe.skipIf(!(await databaseReachable()))("retiring unregistered people against Postgres", () => {
  let database: Client;
  let baselineDirectory: string;
  let ledgerBefore: Awaited<ReturnType<typeof ledgerRows>>;

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();
    baselineDirectory = mkdtempSync(join(tmpdir(), "haalkhata-retire-baseline-"));
    for (const filename of readdirSync(MIGRATIONS_DIRECTORY)) {
      if (filename.endsWith(".sql") && filename < MIGRATION_FILE) {
        copyFileSync(join(MIGRATIONS_DIRECTORY, filename), join(baselineDirectory, filename));
      }
    }
    await migrate(baselineDirectory);
    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await seed(database);
    ledgerBefore = await ledgerRows(database);
    await migrate(MIGRATIONS_DIRECTORY);
  }, 120_000);

  afterAll(async () => {
    await database?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
    if (baselineDirectory) rmSync(baselineDirectory, { recursive: true, force: true });
  });

  it("keeps everyone who signed in exactly as they were", async () => {
    const { rows } = await database.query(
      `SELECT id, name, email, google_sub, apple_sub, password_hash IS NOT NULL AS has_password
         FROM users WHERE id = ANY($1::text[]) ORDER BY id`,
      [[ALICE, BOBBY, CAROL]],
    );
    expect(rows).toEqual([
      { id: ALICE, name: "Alice", email: "alice@example.com", google_sub: "google-alice", apple_sub: null, has_password: false },
      { id: BOBBY, name: "Bobby", email: "bobby@privaterelay.appleid.com", google_sub: null, apple_sub: "apple-bobby", has_password: false },
      { id: CAROL, name: "Carol", email: "carol@example.com", google_sub: null, apple_sub: null, has_password: true },
    ]);
  });

  it("deletes a placeholder that held nothing, with its seat, friendships and notifications", async () => {
    expect((await database.query(`SELECT id FROM users WHERE id = $1`, [FRIEND_ONLY])).rows).toEqual([]);
    expect((await database.query(`SELECT 1 FROM group_members WHERE user_id = $1`, [FRIEND_ONLY])).rows).toEqual([]);
    expect(
      (await database.query(`SELECT 1 FROM friendships WHERE user_id = $1 OR friend_id = $1`, [FRIEND_ONLY])).rows,
    ).toEqual([]);
    expect((await database.query(`SELECT id FROM notifications ORDER BY id`)).rows).toEqual([{ id: "note-alice" }]);
  });

  it("turns a placeholder that holds money into a Deleted member, and no balance moves", async () => {
    const { rows } = await database.query(
      `SELECT name, email, phone, avatar_color, deleted_at IS NOT NULL AS deleted FROM users WHERE id = $1`,
      [LEGACY],
    );
    expect(rows).toEqual([
      { name: "Deleted member", email: null, phone: null, avatar_color: "#6b7280", deleted: true },
    ]);
    expect(await ledgerRows(database)).toEqual(ledgerBefore);
    // Its seat stays with the money it holds in the group.
    expect(
      (await database.query(`SELECT user_id FROM group_members WHERE group_id = $1 ORDER BY user_id`, [GROUP])).rows,
    ).toEqual([{ user_id: LEGACY }, { user_id: STAND_IN }, { user_id: ALICE }]);
    // Nobody can be friends with it, so nobody can be handed its seat.
    expect(
      (await database.query(`SELECT 1 FROM friendships WHERE user_id = $1 OR friend_id = $1`, [LEGACY])).rows,
    ).toEqual([]);
  });

  it("removes merge tombstones and leaves an earlier stand-in alone", async () => {
    expect((await database.query(`SELECT id FROM users WHERE id = $1`, [TOMBSTONE])).rows).toEqual([]);
    expect((await database.query(`SELECT name FROM users WHERE id = $1`, [STAND_IN])).rows).toEqual([
      { name: "Deleted member" },
    ]);
  });

  it("drops every one-person link and keeps group and profile links", async () => {
    const { rows } = await database.query(`SELECT kind FROM invite_links ORDER BY kind`);
    expect(rows).toEqual([{ kind: "group" }, { kind: "profile" }]);
  });

  it("takes a deleted placeholder out of feed audiences and keeps everyone else in them", async () => {
    const { rows } = await database.query(`SELECT audience FROM activity WHERE id = 'activity-added'`);
    expect(rows[0].audience).toEqual([ALICE, LEGACY]);
  });

  it("drops the columns that only tracked placeholders", async () => {
    const { rows } = await database.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE (table_name = 'users' AND column_name = 'merged_into')
           OR (table_name = 'invite_links' AND column_name = 'invited_user_id')`,
    );
    expect(rows).toEqual([]);
  });

  it("refuses a live row nobody can sign in to, and a one-person link", async () => {
    await expect(
      database.query(
        `INSERT INTO users (id, email, name, avatar_color) VALUES ('new-placeholder', 'new@example.com', 'New', '#857a68')`,
      ),
    ).rejects.toMatchObject({ constraint: "chk_users_can_sign_in" });
    await expect(
      database.query(
        `INSERT INTO users (id, email, name, avatar_color, apple_sub) VALUES ('empty-apple', 'empty@example.com', 'Empty', '#857a68', '')`,
      ),
    ).rejects.toMatchObject({ constraint: "chk_users_can_sign_in" });
    await expect(
      database.query(`INSERT INTO invite_links (token, kind, inviter_id) VALUES ($1, 'friend', $2)`, [token("f"), ALICE]),
    ).rejects.toMatchObject({ constraint: "chk_invite_links_kind" });
  });

  it("rolls back to the old shape and forward again", async () => {
    expect((await migrate(MIGRATIONS_DIRECTORY, "down", 1)).map((migration) => migration.name)).toEqual([
      MIGRATION_FILE.slice(0, -4),
    ]);
    const restored = await database.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'merged_into'`,
    );
    expect(restored.rows).toHaveLength(1);
    expect((await migrate(MIGRATIONS_DIRECTORY)).map((migration) => migration.name)).toEqual([
      MIGRATION_FILE.slice(0, -4),
    ]);
    expect(await ledgerRows(database)).toEqual(ledgerBefore);
  });
});
