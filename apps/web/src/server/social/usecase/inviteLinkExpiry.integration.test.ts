/**
 * Real PostgreSQL regression: a group's join link works for a week and then
 * says it expired, to anyone opening or accepting it, even once a new link
 * has replaced it. Asking for the link again returns the same one until
 * then, and two members asking at once after it ran out get the same new one.
 */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GROUP_LEDGER_LOCK_PREFIX } from "@/server/common/ledger/ledgerLocks.constants";
import { testDatabaseName } from "@/server/common/testing/testDatabase";

const ADMIN_URL = process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = testDatabaseName("haalkhata_invite_link_expiry_test");
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const OWNER = "expiry-owner";
const MEMBER = "expiry-member";
const JOINER = "expiry-joiner";
const LATECOMER = "expiry-latecomer";
const GROUP = "expiry-group";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
    await probe.end().catch(() => undefined);
  }
}

const reachable = await databaseReachable();

describe.skipIf(!reachable)("group invite links expire, against Postgres", () => {
  let database: Client;
  let social: typeof import("./social.usecase");
  let closePool: () => Promise<void>;

  /**
   * Moves a link's date into the past, as if a week had gone by.
   *
   * @param token - The link to age.
   */
  const ageLink = async (token: string) => {
    await database.query("UPDATE invite_links SET expires_at = now() - interval '1 minute' WHERE token = $1", [token]);
  };

  /** Whether the joiner is in the group yet. */
  const joinerIsMember = async (personId: string) => {
    const { rows } = await database.query("SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2", [GROUP, personId]);
    return rows.length === 1;
  };

  /**
   * Waits until a request reaches the held group lock.
   * @returns When a queued transaction can be changed deterministically.
   */
  async function waitForGroupWaiter(): Promise<void> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const { rows } = await database.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
      );
      if (rows[0].total > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("expected a request waiting on its group lock");
  }

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
    social = await import("./social.usecase");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, onboarded_at, google_sub) VALUES
         ($1, 'owner@example.com', 'Olu Owner', '#c73e2e', now(), 'google-expiry-owner'),
         ($2, 'member@example.com', 'Mira Member', '#0f8a5f', now(), 'google-expiry-member'),
         ($3, 'joiner@example.com', 'Jo Joiner', '#1d4ed8', now(), 'google-expiry-joiner'),
         ($4, 'late@example.com', 'Lee Latecomer', '#7c3aed', now(), 'google-expiry-late')`,
      [OWNER, MEMBER, JOINER, LATECOMER],
    );
    await database.query(`INSERT INTO groups (id, name, created_by) VALUES ($1, 'Flatmates', $2)`, [GROUP, OWNER]);
    await database.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
      [GROUP, OWNER, MEMBER],
    );
  }, 60_000);

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("makes a link that works for a week, and hands the same one back until then", async () => {
    const first = await social.createGroupInviteLink(MEMBER, GROUP);
    const again = await social.createGroupInviteLink(OWNER, GROUP);

    expect(Math.abs(Date.parse(first.expiresAt) - Date.now() - WEEK_MS)).toBeLessThan(60_000);
    expect(again).toEqual(first);
    await expect(social.previewInviteLink(first.token)).resolves.toMatchObject({ groupName: "Flatmates" });
  });

  it("says it expired to anyone opening or accepting it, and lets nobody in", async () => {
    const { token } = await social.createGroupInviteLink(MEMBER, GROUP);
    await ageLink(token);

    await expect(social.previewInviteLink(token)).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringMatching(/has expired/),
    });
    await expect(social.acceptInviteLink(JOINER, token)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(await joinerIsMember(JOINER)).toBe(false);
  });

  it("replaces it on the next ask, and the old one still says it expired", async () => {
    const { token: oldToken } = await social.createGroupInviteLink(MEMBER, GROUP);
    await ageLink(oldToken);

    const replacement = await social.createGroupInviteLink(MEMBER, GROUP);

    expect(replacement.token).not.toBe(oldToken);
    expect(Math.abs(Date.parse(replacement.expiresAt) - Date.now() - WEEK_MS)).toBeLessThan(60_000);
    await expect(social.previewInviteLink(oldToken)).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(social.acceptInviteLink(JOINER, replacement.token)).resolves.toEqual({ groupId: GROUP, expenseId: "" });
    expect(await joinerIsMember(JOINER)).toBe(true);
  });

  it("gives two members asking at once after it ran out the same new link", async () => {
    const { token: oldToken } = await social.createGroupInviteLink(MEMBER, GROUP);
    await ageLink(oldToken);

    const [fromMember, fromOwner] = await Promise.all([
      social.createGroupInviteLink(MEMBER, GROUP),
      social.createGroupInviteLink(OWNER, GROUP),
    ]);

    expect(fromOwner.token).toBe(fromMember.token);
    await expect(social.previewInviteLink(fromMember.token)).resolves.toMatchObject({ kind: "group" });
  });

  it("calls a link its owner turned off before its date turned off, not expired", async () => {
    const { token } = await social.createGroupInviteLink(MEMBER, GROUP);

    await social.revokeGroupInviteLink(OWNER, GROUP);

    await expect(social.previewInviteLink(token)).rejects.toMatchObject({
      code: "not_found",
      message: expect.stringMatching(/isn't valid or was turned off/),
    });
    await expect(social.acceptInviteLink(LATECOMER, token)).rejects.toMatchObject({ code: "not_found" });
  });

  it("never stores a group link without a date", async () => {
    await expect(
      database.query(
        `INSERT INTO invite_links (token, kind, inviter_id, group_id)
         VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'group', $1, $2)`,
        [OWNER, GROUP],
      ),
    ).rejects.toThrow(/chk_invite_links_group_expiry/);
  });

  it("keeps profile links without a date, so they never expire", async () => {
    const { token } = await social.getProfileInviteLink(OWNER);

    const { rows } = await database.query("SELECT expires_at FROM invite_links WHERE token = $1", [token]);
    expect(rows[0].expires_at).toBeNull();
    await expect(social.previewInviteLink(token)).resolves.toMatchObject({ kind: "profile" });
  });
  it("admits an unrelated person when only existing members block each other", async () => {
    const { token } = await social.createGroupInviteLink(OWNER, GROUP);
    await database.query("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)", [OWNER, MEMBER]);
    try {
      await expect(social.acceptInviteLink(LATECOMER, token)).resolves.toEqual({ groupId: GROUP, expenseId: "" });
      expect(await joinerIsMember(LATECOMER)).toBe(true);
    } finally {
      await database.query("DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2", [OWNER, MEMBER]);
    }
  });

  it("refuses a queued mint when its member is removed and the owner revokes links", async () => {
    await social.revokeGroupInviteLink(OWNER, GROUP);
    await database.query("BEGIN");
    await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [GROUP_LEDGER_LOCK_PREFIX + GROUP]);
    const mint = social.createGroupInviteLink(MEMBER, GROUP).catch((error: unknown) => error);
    try {
      await waitForGroupWaiter();
      await database.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [GROUP, MEMBER]);
      await database.query("UPDATE invite_links SET revoked_at = now() WHERE group_id = $1 AND revoked_at IS NULL", [GROUP]);
      await database.query("COMMIT");
      expect(await mint).toMatchObject({ code: "permission_denied" });
      await social.revokeGroupInviteLink(OWNER, GROUP);
      const { rows } = await database.query("SELECT 1 FROM invite_links WHERE group_id = $1 AND revoked_at IS NULL", [GROUP]);
      expect(rows).toHaveLength(0);
    } finally {
      await database.query("ROLLBACK");
      await database.query("INSERT INTO group_members(group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [GROUP, MEMBER]);
    }
  });

  it("refuses creating a fresh link on archived history", async () => {
    await database.query("UPDATE groups SET status = 'archived' WHERE id = $1", [GROUP]);
    try {
      await expect(social.createGroupInviteLink(MEMBER, GROUP)).rejects.toMatchObject({ code: "failed_precondition" });
    } finally {
      await database.query("UPDATE groups SET status = 'active' WHERE id = $1", [GROUP]);
    }
  });

  it("refuses a queued acceptance when its link is revoked under the group lock", async () => {
    await database.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [GROUP, LATECOMER]);
    const { token } = await social.createGroupInviteLink(OWNER, GROUP);
    await database.query("BEGIN");
    await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [GROUP_LEDGER_LOCK_PREFIX + GROUP]);
    const acceptance = social.acceptInviteLink(LATECOMER, token).catch((error: unknown) => error);
    try {
      await waitForGroupWaiter();
      await database.query("UPDATE invite_links SET revoked_at = clock_timestamp() WHERE token = $1", [token]);
      await database.query("COMMIT");
      expect(await acceptance).toMatchObject({ code: "not_found" });
      expect(await joinerIsMember(LATECOMER)).toBe(false);
    } finally {
      await database.query("ROLLBACK");
    }
  });

  it("checks link expiry using current time after waiting for the group lock", async () => {
    const { token } = await social.createGroupInviteLink(OWNER, GROUP);
    await database.query("BEGIN");
    await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [GROUP_LEDGER_LOCK_PREFIX + GROUP]);
    const acceptance = social.acceptInviteLink(LATECOMER, token).catch((error: unknown) => error);
    try {
      await waitForGroupWaiter();
      await database.query("UPDATE invite_links SET expires_at = clock_timestamp() WHERE token = $1", [token]);
      await database.query("COMMIT");
      expect(await acceptance).toMatchObject({ code: "failed_precondition" });
      expect(await joinerIsMember(LATECOMER)).toBe(false);
    } finally {
      await database.query("ROLLBACK");
    }
  });

});
