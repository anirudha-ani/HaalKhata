/** SQL for SMS verification state: per-account single-use codes and the durable send ledger. */

import { execute, query, queryOne } from "@/server/common/db/db";

/** The live verification behind one account and number. */
export interface PhoneVerificationRow {
  /** Code checks spent on it so far. */
  check_count: number;
  /** When it stops being answerable, as an ISO timestamp. */
  expires_at: string;
  /** Twilio's id for the verification, or null until a send was accepted. */
  provider_sid: string | null;
  /**
   * False when the provider's verification began before this row followed
   * it, so checks taken elsewhere are missing from check_count.
   */
  checks_known: boolean;
}

/** The verification an accepted send reached, as the provider's answer and the clock say. */
export interface ProviderSend {
  /** Twilio's id for the verification. */
  sid: string;
  /** When Twilio created it (ISO), or null when the answer did not say. */
  createdAt: string | null;
  /** When this server began the send (ISO). */
  startedAt: string;
}

/** How a code-check attempt against the stored verification state resolved. */
export type PhoneCheckAttempt =
  /**
   * An attempt was available and has now been spent; call the provider.
   * providerSid names the verification it was spent on, for the writes
   * that follow the provider's answer; checksKnown is false when checks
   * taken elsewhere may be missing from checkCount.
   */
  | {
      status: "ok";
      checkCount: number;
      expiresAt: string;
      providerSid: string | null;
      checksKnown: boolean;
    }
  /** No live verification for this account and phone: expired, consumed, or never sent. */
  | { status: "no_verification" }
  /** The verification is live but its attempt budget is used up until it expires. */
  | { status: "exhausted"; expiresAt: string };

/**
 * Reads the live verification for this account and number, if there is one.
 *
 * @param userId - Account that asked for the code.
 * @param phone - E.164 number the code was sent to.
 * @returns The row, or undefined when none is live.
 */
export async function findPhoneVerification(
  userId: string,
  phone: string,
): Promise<PhoneVerificationRow | undefined> {
  return queryOne<PhoneVerificationRow>(
    `SELECT check_count, expires_at, provider_sid, checks_known FROM phone_verifications
      WHERE user_id = $1 AND phone = $2 AND expires_at > NOW()`,
    [userId, phone],
  );
}

/**
 * Starts the account's one active verification before an SMS is sent, or
 * keeps it when one for the same number is still live.
 *
 * The row is written before the send so that a delivered code always has a
 * row to be checked against. Its expiry is provisional until the provider
 * accepts the send, when {@link recordProviderVerification} sets it from the
 * verification Twilio actually holds. A live row for the same number is kept
 * as it is: if it stands for an accepted verification, the resend reaches
 * that same verification (same code, same five checks, same expiry), and
 * resetting the count here would let this server invite checks Twilio has
 * stopped accepting. A different number, or nothing live, starts afresh.
 *
 * Expired rows are pruned here, the same bounded-cleanup pattern the sign-in
 * nonces use, so the table never outgrows its ten-minute horizon.
 *
 * @param userId - Account requesting the SMS.
 * @param phone - E.164 destination the code is being sent to.
 * @param lifetimeSeconds - Seconds until a new verification stops being answerable.
 */
export async function beginPhoneVerification(
  userId: string,
  phone: string,
  lifetimeSeconds: number,
): Promise<void> {
  await execute("DELETE FROM phone_verifications WHERE expires_at <= NOW()", []);
  await execute(
    `INSERT INTO phone_verifications (user_id, phone, check_count, expires_at, provider_sid, checks_known)
     VALUES ($1, $2, 0, NOW() + make_interval(secs => $3), NULL, TRUE)
     ON CONFLICT (user_id) DO UPDATE
       SET phone = EXCLUDED.phone,
           check_count = 0,
           expires_at = EXCLUDED.expires_at,
           provider_sid = NULL,
           checks_known = TRUE
       WHERE phone_verifications.phone <> EXCLUDED.phone
          OR phone_verifications.expires_at <= NOW()`,
    [userId, phone, lifetimeSeconds],
  );
}

/**
 * Binds the row to the verification the provider says the send reached.
 *
 * Twilio keeps one verification per number for its ten minutes, and what
 * its creation time says decides the row's count:
 * - The same verification as before is a resend: Twilio kept its code, its
 *   five checks and its expiry, so the row keeps its count and expiry too.
 * - One Twilio created during this send is new: no check has touched it,
 *   so the count starts at zero, and the expiry is counted from its
 *   creation. A send that failed at minute 0 and succeeded at minute 9 is
 *   then answerable until minute 19, as Twilio's is.
 * - One created earlier, while this row (with no id yet) already followed
 *   the number, is one an earlier send reached although it looked failed (a
 *   timeout). Every check on it went through this row, so the count stands.
 * - Anything else was started before this row followed it: by this account
 *   before it switched to another number and back, or by another account
 *   holding the same number. Its earlier checks were spent elsewhere. The
 *   count starts at zero and is marked unknown, so a wrong code is refused
 *   without naming the tries left; Twilio's own limit (60202) still locks
 *   the row when the provider reaches it.
 *
 * The provider's clock and ours are compared with some slack, since Twilio
 * gives its creation time to the second.
 *
 * @param userId - Account the code was sent for.
 * @param phone - E.164 number it was sent to.
 * @param send - The verification the send reached, and when the send began.
 * @param lifetimeSeconds - Seconds a verification stays answerable after it is created.
 * @param clockSlackSeconds - How far apart the provider's clock and ours may read.
 */
export async function recordProviderVerification(
  userId: string,
  phone: string,
  send: ProviderSend,
  lifetimeSeconds: number,
  clockSlackSeconds: number,
): Promise<void> {
  // Every SET expression reads the row as it was before this update, so
  // expires_at below is still the provisional one from the row's start.
  await execute(
    `UPDATE phone_verifications
        SET check_count = CASE
              WHEN provider_sid = $3 THEN check_count
              WHEN $4::timestamptz >= $5::timestamptz - make_interval(secs => $7) THEN 0
              WHEN provider_sid IS NULL
               AND $4::timestamptz >= expires_at - make_interval(secs => $6) - make_interval(secs => $7)
                THEN check_count
              ELSE 0
            END,
            checks_known = CASE
              WHEN provider_sid = $3 THEN checks_known
              WHEN $4::timestamptz >= $5::timestamptz - make_interval(secs => $7) THEN TRUE
              WHEN provider_sid IS NULL
               AND $4::timestamptz >= expires_at - make_interval(secs => $6) - make_interval(secs => $7)
                THEN TRUE
              ELSE FALSE
            END,
            expires_at = CASE
              WHEN provider_sid = $3 THEN expires_at
              ELSE COALESCE($4::timestamptz, NOW()) + make_interval(secs => $6)
            END,
            provider_sid = $3
      WHERE user_id = $1 AND phone = $2`,
    [userId, phone, send.sid, send.createdAt, send.startedAt, lifetimeSeconds, clockSlackSeconds],
  );
}

/**
 * Atomically spends one code-check attempt for this account and phone.
 *
 * The increment happens BEFORE the provider is called: a crash mid-check has
 * then still consumed the attempt, so the budget can never be exceeded by
 * retrying into a failure. An exhausted row is left in place: it keeps
 * blocking attempts, and sends, until it expires, rather than letting
 * deletion reopen the budget.
 *
 * @param userId - Account submitting the code.
 * @param phone - E.164 number the code claims to verify.
 * @param maxChecks - Attempts allowed per verification.
 * @returns How the attempt resolved, with the count and expiry it found.
 */
export async function spendPhoneCheckAttempt(
  userId: string,
  phone: string,
  maxChecks: number,
): Promise<PhoneCheckAttempt> {
  const spent = await queryOne<PhoneVerificationRow>(
    `UPDATE phone_verifications
        SET check_count = check_count + 1
      WHERE user_id = $1 AND phone = $2 AND expires_at > NOW() AND check_count < $3
      RETURNING check_count, expires_at, provider_sid, checks_known`,
    [userId, phone, maxChecks],
  );
  if (spent) {
    return {
      status: "ok",
      checkCount: spent.check_count,
      expiresAt: spent.expires_at,
      providerSid: spent.provider_sid,
      checksKnown: spent.checks_known,
    };
  }
  const existing = await findPhoneVerification(userId, phone);
  return existing
    ? { status: "exhausted", expiresAt: existing.expires_at }
    : { status: "no_verification" };
}

/**
 * Marks a checked verification as out of attempts, for when the provider
 * reports its own check limit reached. The row stays until it expires, so
 * sends and checks are refused with the time left instead of reaching a
 * provider that will refuse them.
 *
 * Only the verification that was checked is marked: the provider's answer
 * can arrive after another session has started a verification for a
 * different number, or Twilio has started a new one for the same number,
 * and that one has its own five checks.
 *
 * @param userId - Account whose verification ran out.
 * @param phone - E.164 number of the checked verification.
 * @param providerSid - Twilio's id for it, as the attempt found it (null when unknown).
 * @param maxChecks - Attempts allowed per verification.
 */
export async function exhaustPhoneVerification(
  userId: string,
  phone: string,
  providerSid: string | null,
  maxChecks: number,
): Promise<void> {
  await execute(
    `UPDATE phone_verifications SET check_count = GREATEST(check_count, $4)
      WHERE user_id = $1 AND phone = $2 AND provider_sid IS NOT DISTINCT FROM $3`,
    [userId, phone, providerSid, maxChecks],
  );
}

/**
 * Removes a checked verification: after the provider approved its code,
 * making approval single-use on this side regardless of provider behavior,
 * or once the provider no longer holds it.
 *
 * Only the verification that was checked is removed, for the same reason as
 * {@link exhaustPhoneVerification}: a late answer must not delete a newer
 * verification whose code is still on its way.
 *
 * @param userId - Account the verification belongs to.
 * @param phone - E.164 number of the checked verification.
 * @param providerSid - Twilio's id for it, as the attempt found it (null when unknown).
 */
export async function consumePhoneVerification(
  userId: string,
  phone: string,
  providerSid: string | null,
): Promise<void> {
  await execute(
    `DELETE FROM phone_verifications
      WHERE user_id = $1 AND phone = $2 AND provider_sid IS NOT DISTINCT FROM $3`,
    [userId, phone, providerSid],
  );
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
