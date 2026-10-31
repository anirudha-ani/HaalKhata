/**
 * Real PostgreSQL regression: a group's join link works for a week and then
 * says it expired, to anyone opening or accepting it, even once a new link
 * has replaced it. Asking for the link again returns the same one until
 * then, and two members asking at once after it ran out get the same new one.
 */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
});
