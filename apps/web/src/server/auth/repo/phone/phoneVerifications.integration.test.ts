/**
 * Integration test for the SMS verification state, run against a real Postgres.
 *
 * The usecase tests mock this repo, so they prove the decisions but not the
 * conditional upsert that keeps a live verification through a resend. This
 * suite runs the statements and checks what the table holds afterwards.
 *
 * Skips itself when no database is reachable, so it is safe in the suite.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const ADMIN_URL =
  process.env.MERGE_TEST_ADMIN_URL ?? "postgres://haalkhata:change-me@127.0.0.1:5432/postgres";
const TEST_DATABASE = "haalkhata_phone_verification_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DATABASE}`);

const USER = "phone-user-1";
const PHONE = "+16175551212";
const OTHER_PHONE = "+16175550000";
const LIFETIME_SECONDS = 600;
const MAX_CHECKS = 5;

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

const reachable = await databaseReachable();

describe.skipIf(!reachable)("phone verification state against Postgres", () => {
  let database: Client;
  let repo: typeof import("./phoneVerifications.repo");
  let closePool: () => Promise<void>;

  /**
   * Reads the user's row straight from the table. Timestamps arrive as ISO
   * strings: db.ts installs that parser process-wide, this client included.
   *
   * @returns The stored phone, count and expiry, or undefined.
   */
  async function storedRow(): Promise<
    { phone: string; check_count: number; expires_at: string } | undefined
  > {
    const result = await database.query(
      "SELECT phone, check_count, expires_at FROM phone_verifications WHERE user_id = $1",
      [USER],
    );
    return result.rows[0];
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
    repo = await import("./phoneVerifications.repo");

    database = new Client({ connectionString: TEST_URL });
    await database.connect();
    await database.query(
      `INSERT INTO users (id, email, name, avatar_color, google_sub, onboarded_at)
       VALUES ($1, 'phone@example.com', 'Phone', '#c73e2e', 'google-sub-phone', now())`,
      [USER],
    );
  }, 60_000);

  beforeEach(async () => {
    await database.query("DELETE FROM phone_verifications");
  });

  afterAll(async () => {
    await database?.end();
    await closePool?.();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.end();
  });

  it("starts a verification with a full budget and a ten-minute expiry", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);

    const stored = await storedRow();
    expect(stored?.phone).toBe(PHONE);
    expect(stored?.check_count).toBe(0);
    const secondsLeft = (Date.parse(stored!.expires_at) - Date.now()) / 1000;
    expect(secondsLeft).toBeGreaterThan(LIFETIME_SECONDS - 5);
    expect(secondsLeft).toBeLessThanOrEqual(LIFETIME_SECONDS);
  });

  it("keeps the spent budget and the expiry through a resend to the same number", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    // Wind the clock back on the row: the first send was two minutes ago.
    await database.query(
      "UPDATE phone_verifications SET expires_at = expires_at - interval '2 minutes'",
    );
    for (let check = 0; check < 4; check += 1) {
      await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    }
    const before = await storedRow();

    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);

    // Twilio resends the same code under the same verification, so the
    // fifth check is still the last one and the expiry has not moved.
    const after = await storedRow();
    expect(after?.check_count).toBe(4);
    expect(after?.expires_at).toBe(before?.expires_at);
  });

  it("starts afresh for a different number", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    await database.query(
      "UPDATE phone_verifications SET expires_at = expires_at - interval '2 minutes'",
    );

    await repo.beginPhoneVerification(USER, OTHER_PHONE, LIFETIME_SECONDS);

    const stored = await storedRow();
    expect(stored?.phone).toBe(OTHER_PHONE);
    expect(stored?.check_count).toBe(0);
    expect((Date.parse(stored!.expires_at) - Date.now()) / 1000).toBeGreaterThan(LIFETIME_SECONDS - 5);
  });

  it("starts afresh once the verification has expired", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    await database.query("UPDATE phone_verifications SET expires_at = now() - interval '1 second'");

    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);

    const stored = await storedRow();
    expect(stored?.check_count).toBe(0);
    expect((Date.parse(stored!.expires_at) - Date.now()) / 1000).toBeGreaterThan(LIFETIME_SECONDS - 5);
  });

  it("spends five checks, then reports the verification exhausted with its expiry", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    const counts: number[] = [];
    for (let check = 0; check < MAX_CHECKS; check += 1) {
      const attempt = await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
      if (attempt.status !== "ok") throw new Error(`check ${check + 1} was ${attempt.status}`);
      counts.push(attempt.checkCount);
      expect(Date.parse(attempt.expiresAt)).toBeGreaterThan(Date.now());
    }
    expect(counts).toEqual([1, 2, 3, 4, 5]);

    const sixth = await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    expect(sixth.status).toBe("exhausted");

    // A resend does not reopen it.
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    expect((await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS)).status).toBe("exhausted");
  });

  it("finds only the live verification for this account and number", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);

    expect(await repo.findPhoneVerification(USER, PHONE)).toMatchObject({ check_count: 0 });
    expect(await repo.findPhoneVerification(USER, OTHER_PHONE)).toBeUndefined();

    await database.query("UPDATE phone_verifications SET expires_at = now() - interval '1 second'");
    expect(await repo.findPhoneVerification(USER, PHONE)).toBeUndefined();
    expect(await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS)).toEqual({
      status: "no_verification",
    });
  });

  it("marks a verification exhausted when the provider says so, never lowering the count", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);

    await repo.exhaustPhoneVerification(USER, MAX_CHECKS);

    expect((await storedRow())?.check_count).toBe(MAX_CHECKS);
    expect((await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS)).status).toBe("exhausted");
  });

  it("forgets the verification once consumed", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);

    await repo.consumePhoneVerification(USER);

    expect(await storedRow()).toBeUndefined();
  });
});
