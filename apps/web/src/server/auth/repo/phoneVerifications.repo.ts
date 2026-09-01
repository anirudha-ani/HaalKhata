/** SQL for SMS verification state: per-account single-use codes and the durable send ledger. */

import { execute, query, queryOne } from "@/server/common/db";

/** How a code-check attempt against the stored verification state resolved. */
export type PhoneCheckAttempt =
  /** An attempt was available and has now been spent; call the provider. */
  | "ok"
  /** No live verification for this account and phone — expired, consumed, or never sent. */
  | "no_verification"
  /** The verification exists but its attempt budget is used up; a new SMS is required. */
  | "exhausted";

/**
 * Starts (or restarts) the account's one active verification. An account has
 * at most one: asking for a new code replaces the old state outright, which
 * also resets the attempt budget — the budget guards one delivered code, not
 * the account (per-account pacing is the rate limiter's job).
 *
 * Expired rows are pruned here, the same bounded-cleanup pattern the sign-in
 * nonces use, so the table never outgrows its ten-minute horizon.
 *
 * @param userId - Account requesting the SMS.
 * @param phone - E.164 destination the code is being sent to.
 * @param lifetimeSeconds - Seconds until the verification stops being answerable.
 */
export async function beginPhoneVerification(
  userId: string,
  phone: string,
  lifetimeSeconds: number,
): Promise<void> {
  await execute("DELETE FROM phone_verifications WHERE expires_at <= NOW()", []);
  await execute(
    `INSERT INTO phone_verifications (user_id, phone, check_count, expires_at)
     VALUES ($1, $2, 0, NOW() + make_interval(secs => $3))
     ON CONFLICT (user_id) DO UPDATE
       SET phone = EXCLUDED.phone, check_count = 0, expires_at = EXCLUDED.expires_at`,
    [userId, phone, lifetimeSeconds],
  );
}

/**
 * Atomically spends one code-check attempt for this account and phone.
 *
 * The increment happens BEFORE the provider is called: a crash mid-check has
 * then still consumed the attempt, so the budget can never be exceeded by
 * retrying into a failure. An exhausted row is left in place — it keeps
 * blocking attempts until it expires, rather than letting deletion reopen
 * the budget.
 *
 * @param userId - Account submitting the code.
 * @param phone - E.164 number the code claims to verify.
 * @param maxChecks - Attempts allowed per delivered code.
 * @returns How the attempt resolved.
 */
export async function spendPhoneCheckAttempt(
  userId: string,
  phone: string,
  maxChecks: number,
): Promise<PhoneCheckAttempt> {
  const spent = await queryOne<{ check_count: number }>(
    `UPDATE phone_verifications
        SET check_count = check_count + 1
      WHERE user_id = $1 AND phone = $2 AND expires_at > NOW() AND check_count < $3
      RETURNING check_count`,
    [userId, phone, maxChecks],
  );
  if (spent) return "ok";
  const existing = await queryOne<{ check_count: number }>(
    `SELECT check_count FROM phone_verifications
      WHERE user_id = $1 AND phone = $2 AND expires_at > NOW()`,
    [userId, phone],
  );
  return existing ? "exhausted" : "no_verification";
}

/**
 * Consumes the account's verification after the provider approved the code,
 * making approval single-use on this side regardless of provider behavior.
 *
 * @param userId - Account whose verification succeeded.
 */
export async function consumePhoneVerification(userId: string): Promise<void> {
  await execute("DELETE FROM phone_verifications WHERE user_id = $1", [userId]);
}

/** Send counts inside each ceiling's window, including the send just recorded. */
export interface PhoneSendCounts {
  /** Sends to this destination in the last hour. */
  destinationHour: number;
  /** Sends to this destination in the last day. */
  destinationDay: number;
  /** Sends started by this client address in the last hour. */
  ipHour: number;
}

/**
 * Records one verification-SMS send and returns the updated window counts.
 *
 * Record-then-count on purpose: two racing sends both land in the ledger
 * before either is judged, so the ceilings can over-refuse by one in a race
 * but never under-count — the failure mode lands on the abuser, not the
 * victim. Rows older than every window are pruned on the way in, the same
 * bounded-cleanup pattern the operations table uses.
 *
 * @param destinationHash - Keyed hash of the destination number.
 * @param clientIp - Caller's resolved address ("unknown" when untrusted).
 * @returns Counts within each ceiling's window, this send included.
 */
export async function recordPhoneSend(
  destinationHash: string,
  clientIp: string,
): Promise<PhoneSendCounts> {
  await execute("DELETE FROM phone_send_events WHERE sent_at < NOW() - INTERVAL '25 hours'", []);
  await execute(
    `INSERT INTO phone_send_events (destination_hash, client_ip) VALUES ($1, $2)`,
    [destinationHash, clientIp],
  );
  const counts = await query<{
    destination_hour: number;
    destination_day: number;
    ip_hour: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM phone_send_events
         WHERE destination_hash = $1 AND sent_at > NOW() - INTERVAL '1 hour') AS destination_hour,
       (SELECT COUNT(*)::int FROM phone_send_events
         WHERE destination_hash = $1 AND sent_at > NOW() - INTERVAL '24 hours') AS destination_day,
       (SELECT COUNT(*)::int FROM phone_send_events
         WHERE client_ip = $2 AND sent_at > NOW() - INTERVAL '1 hour') AS ip_hour`,
    [destinationHash, clientIp],
  );
  const countsRow = counts[0];
  return {
    destinationHour: countsRow?.destination_hour ?? 0,
    destinationDay: countsRow?.destination_day ?? 0,
    ipHour: countsRow?.ip_hour ?? 0,
  };
}
