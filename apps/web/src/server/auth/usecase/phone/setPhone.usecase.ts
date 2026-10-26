/**
 * Setting a phone number: an SMS code proves the caller controls it, then
 * the number is written to their account. A number another account holds
 * moves across, with both sides told (§34). Nothing is ever merged: every
 * row that holds a number belongs to somebody who signed up.
 */

import {
  findUserById,
  findUserByPhone,
  setUserPhone,
  type UserRow,
} from "@/server/auth/repo/users.repo";
import {
  beginPhoneVerification,
  consumePhoneVerification,
  exhaustPhoneVerification,
  findPhoneVerification,
  forgetPhoneVerification,
  recordProviderVerification,
  spendPhoneCheckAttempt,
  type PhoneCheckAttempt,
} from "@/server/auth/repo/phone/phoneVerifications.repo";
import { isUniqueViolation, transaction } from "@/server/common/db/db";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { logEvent } from "@/server/common/logger";
import { UsecaseError, invalid } from "@/server/common/errors";
import {
  DIGITS_ONLY_PATTERN,
  INACTIVE_CODE_MESSAGE,
  LOG_FINGERPRINT_LENGTH,
  MAX_PHONE_CODE_CHECKS,
  MINUTE_MS,
  PHONE_FORMAT_HINT,
  PHONE_VERIFICATION_LIFETIME_SECONDS,
  PROVIDER_CLOCK_SLACK_SECONDS,
  normalizePhone,
} from "@/server/auth/auth.constants";
import {
  codeLengthMessage,
  isCompleteVerificationCode,
} from "@haalkhata/shared/phone/verificationCode";
import { signPayload } from "@/server/auth/usecase/session/session";
import { toPrivateUser } from "../identity/user.mapper";
import {
  checkPhoneVerification,
  startPhoneVerification,
  type PhoneCodeVerdict,
} from "./phoneVerification";

/**
 * The request limits SetPhone answers to. The transport supplies them,
 * since they key on the caller's address and on process memory; this
 * usecase decides which one applies, and when.
 */
export interface PhoneRequestLimits {
  /**
   * Runs before a send is recorded, once the number is known and is not
   * locked out: a send refused for the lockout uses up none of them.
   */
  beforeSend: (phone: string) => Promise<void>;
  /** Runs before a code check is read or spends an attempt. */
  beforeCheck: () => void;
}

/** What SetPhone resolved to: a code sent, or the number on the account. */
export interface SetPhoneResult {
  /** True when an SMS code was sent and no account data has been read or changed. */
  verificationSent?: boolean;
  /** Present once the code checked out and the number is on the account. */
  user?: ReturnType<typeof toPrivateUser>;
}

/**
 * Says how long until a locked-out verification expires and a new code can
 * be sent.
 *
 * @param expiresAt - When the verification expires, as an ISO timestamp.
 * @returns The refusal, naming the minutes left.
 */
function lockedOutMessage(expiresAt: string): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(expiresAt) - Date.now()) / MINUTE_MS));
  const unit = minutes === 1 ? "minute" : "minutes";
  return `too many incorrect codes, you can ask for a new one in ${minutes} ${unit}`;
}

/**
 * Says a code was wrong and how many tries the verification has left, when
 * this server knows: a verification it did not follow from the start may
 * have spent checks elsewhere, and naming a number then would promise tries
 * the provider no longer gives.
 *
 * @param checkCount - Checks spent here, this one included.
 * @param expiresAt - When the verification expires, as an ISO timestamp.
 * @param checksKnown - Whether checkCount is every check the provider has taken.
 * @returns The refusal; the lockout message once no tries are left.
 */
function wrongCodeMessage(checkCount: number, expiresAt: string, checksKnown: boolean): string {
  const triesLeft = MAX_PHONE_CODE_CHECKS - checkCount;
  if (triesLeft <= 0) return lockedOutMessage(expiresAt);
  if (!checksKnown) return "that code doesn't match the one we sent";
  const unit = triesLeft === 1 ? "try" : "tries";
  return `that code doesn't match the one we sent, ${triesLeft} ${unit} left`;
}

/**
 * Refuses anything but a whole code before an attempt is spent on it. A code
 * of another length cannot be ours, and older app builds still send any
 * length from four to ten digits.
 *
 * @param code - The trimmed code from the request.
 * @throws UsecaseError "invalid_argument" naming both lengths, or asking for the code.
 */
function assertWholeCode(code: string): void {
  if (isCompleteVerificationCode(code)) return;
  if (!DIGITS_ONLY_PATTERN.test(code)) invalid("enter the code from our latest text");
  invalid(codeLengthMessage(code.length));
}

/**
 * Refuses a send while this account's verification for the number is out of
 * attempts. Twilio keeps an exhausted verification until it expires, so a
 * new SMS would carry the same code to checks that can only fail.
 *
 * @param userId - Account asking for the code.
 * @param phone - Normalized E.164 number.
 * @throws UsecaseError "invalid_argument" with the minutes left.
 */
async function refuseSendWhileLockedOut(userId: string, phone: string): Promise<void> {
  const live = await findPhoneVerification(userId, phone);
  if (live && live.check_count >= MAX_PHONE_CODE_CHECKS) invalid(lockedOutMessage(live.expires_at));
}

/**
 * Logs a wrong code without the code or the number: the attempt, how long
 * after the first send it came, and keyed fingerprints of the verification
 * and of the code within it. Equal codes in one verification share a
 * fingerprint, so a code tapped or sent again shows up as a repeat, while
 * nothing outside this server's key can recover a code from it.
 *
 * @param userId - Account that sent the code.
 * @param code - The rejected code.
 * @param attempt - The spent attempt's count and the verification's expiry.
 */
function logRejectedCode(
  userId: string,
  code: string,
  attempt: { checkCount: number; expiresAt: string },
): void {
  const verification = `${userId}.${attempt.expiresAt}`;
  const firstSentAt = Date.parse(attempt.expiresAt) - PHONE_VERIFICATION_LIFETIME_SECONDS * 1000;
  logEvent("info", "phone verification code rejected", {
    verification: signPayload("phone-code-log", verification).slice(0, LOG_FINGERPRINT_LENGTH),
    attempt: attempt.checkCount,
    secondsSinceFirstSend: Math.round((Date.now() - firstSentAt) / 1000),
    codeFingerprint: signPayload("phone-code-log", `${verification}.${code}`).slice(
      0,
      LOG_FINGERPRINT_LENGTH,
    ),
  });
}

/**
 * Answers a code the provider did not approve, keeping this server's state
 * in step with the provider's.
 *
 * The writes name the verification that was checked (its number and
 * Twilio id), not just the account: the answer can arrive after another
 * session has started a verification for a different number, and that one's
 * code is still on its way.
 *
 * @param userId - Account that sent the code.
 * @param phone - E.164 number the code was checked against.
 * @param code - The code the provider did not approve.
 * @param attempt - The spent attempt: its count, the expiry, and the verification's id.
 * @param verdict - What the provider said.
 * @throws UsecaseError "invalid_argument" worded for the verdict, always.
 */
async function refuseCode(
  userId: string,
  phone: string,
  code: string,
  attempt: Extract<PhoneCheckAttempt, { status: "ok" }>,
  verdict: Exclude<PhoneCodeVerdict, "approved">,
): Promise<never> {
  if (verdict === "gone") {
    // The provider holds nothing to check a code against, so neither does
    // this server: the next send then starts afresh on both sides, instead
    // of keeping a budget and expiry for a verification that is not there.
    await forgetPhoneVerification(userId, phone, attempt.providerSid);
    invalid(INACTIVE_CODE_MESSAGE);
  }
  if (verdict === "exhausted") {
    await exhaustPhoneVerification(userId, phone, attempt.providerSid, MAX_PHONE_CODE_CHECKS);
    invalid(lockedOutMessage(attempt.expiresAt));
  }
  logRejectedCode(userId, code, attempt);
  invalid(wrongCodeMessage(attempt.checkCount, attempt.expiresAt, attempt.checksKnown));
}

/**
 * Resolves the state of a phone number the caller wants to claim.
 *
 * Whether the call sends or checks is decided here, once, on the trimmed
 * code, and the matching limit runs in its place: a send is refused for
 * the lockout before any send limit counts it.
 *
 * @param userId - Authenticated caller.
 * @param rawPhone - Whatever the user typed.
 * @param verificationCode - Empty (or only spaces) to send an SMS, or the
 *   code to confirm possession.
 * @param limits - The transport's request limits.
 * @returns That a code was sent, or the updated user once it checked out.
 * @throws UsecaseError "invalid_argument" for an unparseable number or a
 *   refused code.
 * @throws UsecaseError "failed_precondition" when the number is the only
 *   identifier of the account that holds it.
 */
export async function setPhone(
  userId: string,
  rawPhone: string,
  verificationCode: string,
  limits: PhoneRequestLimits,
): Promise<SetPhoneResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) invalid(PHONE_FORMAT_HINT);
  const code = verificationCode.trim();

  if (code === "") {
    await refuseSendWhileLockedOut(userId, phone);
    await limits.beforeSend(phone);
    // State first, SMS second: a send the server has no record of would make
    // the delivered code unusable, while a recorded send that failed to
    // deliver just expires. The row also binds the coming check to THIS
    // account and THIS number. A resend while it is live keeps it as it is,
    // the way the provider keeps the verification and its code.
    await beginPhoneVerification(userId, phone, PHONE_VERIFICATION_LIFETIME_SECONDS);
    const startedAt = new Date().toISOString();
    const sent = await startPhoneVerification(phone);
    // Then follow the verification the provider says it reached: the same
    // one keeps its count and expiry, one this send created counts from
    // when Twilio created it, and one that was already there keeps the
    // checks this row saw, or says it cannot know them.
    if (sent.sid) {
      await recordProviderVerification(
        userId,
        phone,
        { sid: sent.sid, createdAt: sent.createdAt, startedAt },
        PHONE_VERIFICATION_LIFETIME_SECONDS,
        PROVIDER_CLOCK_SLACK_SECONDS,
      );
    }
    return { verificationSent: true };
  }
  limits.beforeCheck();
  // A code of another length is refused before it costs an attempt: it
  // cannot be ours, and the provider would only count it against the
  // verification's five.
  assertWholeCode(code);
  // Spend an attempt before the provider is consulted: the budget is this
  // server's own (OWASP's 3–5 band), not an inherited provider behavior, and
  // an attempt consumed by a crash mid-check stays consumed.
  const attempt = await spendPhoneCheckAttempt(userId, phone, MAX_PHONE_CODE_CHECKS);
  if (attempt.status === "no_verification") invalid(INACTIVE_CODE_MESSAGE);
  if (attempt.status === "exhausted") invalid(lockedOutMessage(attempt.expiresAt));
  const verdict = await checkPhoneVerification(phone, code);
  if (verdict !== "approved") await refuseCode(userId, phone, code, attempt, verdict);
  // Single-use on our side: a second check of the same approved code finds
  // no verification, whatever the provider would have said. The number is
  // proven for this account, so its verification goes whichever Twilio id
  // a resend wrote meanwhile; another number's is left alone.
  await consumePhoneVerification(userId, phone);

  let holder = await findUserByPhone(phone);

  // Free, or already ours: write it and move on. The common case.
  if (!holder || holder.id === userId) {
    try {
      await setUserPhone(userId, phone);
    } catch (error) {
      // TOCTOU: another account may claim the partial-unique phone index
      // between the lookup above and this update. Re-read the winner and
      // move the number from it like from any other holder.
      if (!isUniqueViolation(error)) throw error;
      holder = await findUserByPhone(phone);
      if (!holder) {
        throw new UsecaseError(
          "already_exists",
          "that number changed while it was being claimed — please try again",
        );
      }
    }
    if (!holder || holder.id === userId) {
      const refreshed = await findUserById(userId);
      if (!refreshed) throw new UsecaseError("unauthenticated", "account no longer exists");
      return { user: toPrivateUser(refreshed) };
    }
  }

  // Held by another account: TRANSFER, not refusal (§34). Numbers move —
  // lost SIMs, temporary SIMs — and possession-by-SMS is the definition of
  // holding one. Safe precisely because a phone here is a directory
  // pointer, never an authenticator (sign-in uses Google or Apple). Absorbing
  // the ACCOUNT would be wrong; moving the NUMBER, with both sides told,
  // is how every messaging app treats it.
  return transferVerifiedPhone(userId, holder, phone);
}

/**
 * Moves a just-verified number from the registered account holding it onto
 * the caller's, atomically, and tells both sides (§34).
 *
 * @param claimantId - Who proved possession seconds ago.
 * @param holder - The registered account currently pointing at the number.
 * @param phone - The E.164 number changing hands.
 * @returns The claimant's refreshed profile.
 * @throws UsecaseError "failed_precondition" when the number is the
 *   holder's only identifier — clearing it would strand that account.
 */
async function transferVerifiedPhone(
  claimantId: string,
  holder: UserRow,
  phone: string,
): Promise<SetPhoneResult> {
  if (holder.email === null) {
    throw new UsecaseError(
      "failed_precondition",
      "that number is the only way its current account can be reached — get in touch and we'll sort it out",
    );
  }
  await transaction(async (client) => {
    // Both rows locked in sorted order, so a competing transfer serializes
    // instead of deadlocking.
    await client.query(`SELECT id FROM users WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`, [
      [claimantId, holder.id].sort(),
    ]);
    const current = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND phone = $2`,
      [holder.id, phone],
    );
    if (current.rows.length !== 1) {
      // It moved again between verification and this lock; start over.
      invalid("that number changed while it was being claimed — please try again");
    }
    await setUserPhone(holder.id, null, client);
    await setUserPhone(claimantId, phone, client);
    // Both parties hear about it, on the transfer's own transaction: the
    // notification IS the theft alarm, so it must not be lose-able.
    await insertNotifications(
      [holder.id],
      {
        type: "phone_transferred",
        title: `Your number ${phone} now points to a different account`,
        body: "Someone verified it by SMS — usually a moved or reissued SIM. Still your number? Verify it again from Account to take it back.",
        link: "/account",
      },
      client,
    );
    await insertNotifications(
      [claimantId],
      {
        type: "phone_transferred",
        title: `${phone} is now on your profile`,
        body: "It previously pointed to another account; they've been told.",
        link: "/account",
      },
      client,
    );
  });
  const refreshed = await findUserById(claimantId);
  if (!refreshed) throw new UsecaseError("unauthenticated", "account no longer exists");
  return { user: toPrivateUser(refreshed) };
}
