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
const FIRST_SID = "VE00000000000000000000000000000001";
const SECOND_SID = "VE00000000000000000000000000000002";
const LIFETIME_SECONDS = 600;
const MAX_CHECKS = 5;
const CLOCK_SLACK_SECONDS = 5;

/**
 * A time some way back, to the second, the way Twilio writes date_created.
 *
 * @param secondsAgo - How long ago.
 * @returns The ISO timestamp.
 */
function twilioTime(secondsAgo: number): string {
  return new Date(Date.now() - secondsAgo * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

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
    | {
        phone: string;
        check_count: number;
        expires_at: string;
        provider_sid: string | null;
        checks_known: boolean;
      }
    | undefined
  > {
    const result = await database.query(
      "SELECT phone, check_count, expires_at, provider_sid, checks_known FROM phone_verifications WHERE user_id = $1",
      [USER],
    );
    return result.rows[0];
  }

  /**
   * Records the verification a send reached, as the usecase does after an
   * accepted send.
   *
   * @param phone - Number the send went to.
   * @param providerSid - Twilio's id for the verification.
   * @param createdAt - When Twilio created it, or null when its answer did not say.
   * @param startedAt - When the send began; by default when Twilio created
   *   the verification, as for a send that created it.
   */
  async function record(
    phone: string,
    providerSid: string,
    createdAt: string | null,
    startedAt: string = createdAt ?? new Date().toISOString(),
  ): Promise<void> {
    await repo.recordProviderVerification(
      USER,
      phone,
      { sid: providerSid, createdAt, startedAt },
      LIFETIME_SECONDS,
      CLOCK_SLACK_SECONDS,
    );
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

    await repo.exhaustPhoneVerification(USER, PHONE, null, MAX_CHECKS);

    expect((await storedRow())?.check_count).toBe(MAX_CHECKS);
    expect((await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS)).status).toBe("exhausted");
  });

  it("forgets the verification once consumed", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);

    await repo.consumePhoneVerification(USER, PHONE);

    expect(await storedRow()).toBeUndefined();
  });

  /**
   * Seconds from now until the stored row expires.
   *
   * @returns The seconds left, fractional.
   */
  async function secondsLeft(): Promise<number> {
    return (Date.parse((await storedRow())!.expires_at) - Date.now()) / 1000;
  }

  it("counts the expiry from Twilio's verification after a send that failed first", async () => {
    // Minute 0: the row is written, the send fails, no verification exists
    // at Twilio. A check against it still spends a try.
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    await database.query(
      "UPDATE phone_verifications SET expires_at = expires_at - interval '9 minutes'",
    );
    // Minute 9: the retry reaches Twilio, which creates the verification now.
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await record(PHONE, FIRST_SID, new Date().toISOString());

    // Answerable until minute 19, as Twilio's is, with its five fresh checks.
    expect(await secondsLeft()).toBeGreaterThan(LIFETIME_SECONDS - 5);
    expect(await storedRow()).toMatchObject({ check_count: 0, provider_sid: FIRST_SID });
  });

  it("keeps the count and expiry when a resend reaches the same verification", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await record(PHONE, FIRST_SID, new Date(Date.now() - 3 * 60 * 1000).toISOString());
    for (let check = 0; check < 3; check += 1) {
      await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    }
    const before = await storedRow();

    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await record(PHONE, FIRST_SID, new Date().toISOString());

    expect(await storedRow()).toEqual({ ...before, check_count: 3 });
  });

  it("starts afresh when Twilio starts a new verification for the same number", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await record(PHONE, FIRST_SID, new Date(Date.now() - 5 * 60 * 1000).toISOString());
    await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);

    await record(PHONE, SECOND_SID, new Date().toISOString());

    expect(await storedRow()).toMatchObject({ check_count: 0, provider_sid: SECOND_SID });
    expect(await secondsLeft()).toBeGreaterThan(LIFETIME_SECONDS - 5);
  });

  it("lets a late answer for one number leave another number's verification alone", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await record(PHONE, FIRST_SID, null);
    const attempt = await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    if (attempt.status !== "ok") throw new Error(`attempt was ${attempt.status}`);
    expect(attempt.providerSid).toBe(FIRST_SID);
    // While that check waits on Twilio, another session asks for a code for
    // a different number, which replaces the account's row.
    await repo.beginPhoneVerification(USER, OTHER_PHONE, LIFETIME_SECONDS);
    await record(OTHER_PHONE, SECOND_SID, null);

    // Twilio's late "gone", "exhausted" and "approved" answers for the
    // first number.
    await repo.forgetPhoneVerification(USER, PHONE, attempt.providerSid);
    await repo.exhaustPhoneVerification(USER, PHONE, attempt.providerSid, MAX_CHECKS);
    await repo.consumePhoneVerification(USER, PHONE);

    expect(await storedRow()).toMatchObject({
      phone: OTHER_PHONE,
      provider_sid: SECOND_SID,
      check_count: 0,
    });
  });

  it("lets a late answer leave a newer verification for the same number alone", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await record(PHONE, FIRST_SID, null);
    const attempt = await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    if (attempt.status !== "ok") throw new Error(`attempt was ${attempt.status}`);
    await record(PHONE, SECOND_SID, null);

    // Twilio's late "gone" for the first verification.
    await repo.forgetPhoneVerification(USER, PHONE, attempt.providerSid);

    expect(await storedRow()).toMatchObject({ provider_sid: SECOND_SID, check_count: 0 });
  });

  it("forgets the verification that was checked", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await record(PHONE, FIRST_SID, null);

    await repo.forgetPhoneVerification(USER, PHONE, FIRST_SID);

    expect(await storedRow()).toBeUndefined();
  });

  it("consumes the number's verification on approval after a resend wrote Twilio's id", async () => {
    // A send that timed out but reached Twilio leaves the row with no id,
    // and a check is spent on it.
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    const attempt = await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    if (attempt.status !== "ok") throw new Error(`attempt was ${attempt.status}`);
    expect(attempt.providerSid).toBeNull();
    // A minute later, while that check waits on Twilio, a resend reaches the
    // same verification and records its id.
    await database.query(
      "UPDATE phone_verifications SET expires_at = expires_at - interval '1 minute'",
    );
    await record(PHONE, FIRST_SID, twilioTime(60), new Date().toISOString());
    expect(await storedRow()).toMatchObject({ provider_sid: FIRST_SID, check_count: 1 });

    // Twilio approves the check.
    await repo.consumePhoneVerification(USER, PHONE);

    expect(await storedRow()).toBeUndefined();
  });

  it("clears the provider id when a different number starts afresh", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await record(PHONE, FIRST_SID, null);

    await repo.beginPhoneVerification(USER, OTHER_PHONE, LIFETIME_SECONDS);

    expect(await storedRow()).toMatchObject({ phone: OTHER_PHONE, provider_sid: null });
  });

  it("keeps the checks this row saw on a verification a send reached although it looked failed", async () => {
    // Minute 0: the send times out, but Twilio created the verification and
    // texted its code, and two wrong codes are checked against it here.
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    await database.query(
      "UPDATE phone_verifications SET expires_at = expires_at - interval '3 minutes'",
    );
    // Minute 3: a resend reaches that same verification.
    await record(PHONE, FIRST_SID, twilioTime(180), new Date().toISOString());

    expect(await storedRow()).toMatchObject({
      check_count: 2,
      checks_known: true,
      provider_sid: FIRST_SID,
    });
    // Twilio's ten minutes, counted from minute 0.
    expect(await secondsLeft()).toBeGreaterThan(LIFETIME_SECONDS - 186);
    expect(await secondsLeft()).toBeLessThan(LIFETIME_SECONDS - 174);
  });

  it("does not claim to know the checks of a verification started before this row followed it", async () => {
    // Three wrong codes for the number, then a switch to another number.
    const firstCreatedAt = twilioTime(120);
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await record(PHONE, FIRST_SID, firstCreatedAt);
    for (let check = 0; check < 3; check += 1) {
      await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS);
    }
    await repo.beginPhoneVerification(USER, OTHER_PHONE, LIFETIME_SECONDS);
    await record(OTHER_PHONE, SECOND_SID, twilioTime(0));

    // Back to the first number inside its ten minutes: Twilio answers with
    // the same verification, its three checks spent.
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    await record(PHONE, FIRST_SID, firstCreatedAt, new Date().toISOString());

    expect(await storedRow()).toMatchObject({
      phone: PHONE,
      provider_sid: FIRST_SID,
      check_count: 0,
      checks_known: false,
    });
    expect(await repo.spendPhoneCheckAttempt(USER, PHONE, MAX_CHECKS)).toMatchObject({
      status: "ok",
      checkCount: 1,
      checksKnown: false,
    });
    // A resend to it later keeps it unknown.
    await record(PHONE, FIRST_SID, firstCreatedAt, new Date().toISOString());
    expect(await storedRow()).toMatchObject({ check_count: 1, checks_known: false });
  });

  it("counts a verification this send created as fully known", async () => {
    await repo.beginPhoneVerification(USER, PHONE, LIFETIME_SECONDS);
    const startedAt = new Date().toISOString();
    await record(PHONE, FIRST_SID, twilioTime(0), startedAt);

    expect(await storedRow()).toMatchObject({ check_count: 0, checks_known: true });
  });
});
