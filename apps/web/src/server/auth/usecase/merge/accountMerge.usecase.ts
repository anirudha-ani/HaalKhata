/**
 * Setting a phone number, and the account merge that a collision triggers.
 *
 * The flow first verifies current control of the number through the configured
 * SMS provider. A collision still cannot silently absorb the other row: the
 * caller is shown exactly what they would take on and has to confirm it. That
 * preview protects against recycled numbers, because control today says
 * nothing about who held the number when older invitations were written.
 */

import {
  findUserById,
  findUserByPhone,
  setUserPhone,
  type UserRow,
} from "@/server/auth/repo/users.repo";
import {
  mergeAccounts,
  previewMerge,
  type MergePreviewRow,
} from "@/server/auth/repo/merge/accountMerge.repo";
import {
  beginPhoneVerification,
  consumePhoneVerification,
  exhaustPhoneVerification,
  findPhoneVerification,
  spendPhoneCheckAttempt,
} from "@/server/auth/repo/phone/phoneVerifications.repo";
import { createHash } from "node:crypto";
import { isUniqueViolation, transaction } from "@/server/common/db/db";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { logEvent } from "@/server/common/logger";
import { UsecaseError, invalid } from "@/server/common/errors";
import { toInt32Cents } from "@/server/common/money/money";
import {
  DIGITS_ONLY_PATTERN,
  LOG_FINGERPRINT_LENGTH,
  MAX_PHONE_CODE_CHECKS,
  MAX_PREVIEW_COUNTERPARTY_NAMES,
  MERGE_TOKEN_LIFETIME_SECONDS,
  MINUTE_MS,
  PHONE_FORMAT_HINT,
  PHONE_VERIFICATION_LIFETIME_SECONDS,
  normalizePhone,
} from "@/server/auth/auth.constants";
import {
  codeLengthMessage,
  isCompleteVerificationCode,
} from "@haalkhata/shared/phone/verificationCode";
import { signPayload, verifyPayloadSignature } from "@/server/auth/usecase/session/session";

/** One message for every failed merge-token check: expired, forged, and malformed all just mean "start over". */
const STALE_MERGE_TOKEN_MESSAGE = "that confirmation is no longer valid, please try again";

/** Said to a code check with no live verification behind it, on this server or the provider. */
const INACTIVE_CODE_MESSAGE = "that code is no longer active, send a new one";
import { isRegisteredUser, toPrivateUser } from "../identity/user.mapper";
import {
  checkPhoneVerification,
  startPhoneVerification,
  type PhoneCodeVerdict,
} from "../phone/phoneVerification";

/** What SetPhone resolved to: either applied outright, or waiting on confirmation. */
export interface SetPhoneResult {
  /** True when an SMS code was sent and no account data has been read or changed. */
  verificationSent?: boolean;
  /** Present when the number was free and written straight to the account. */
  user?: ReturnType<typeof toPrivateUser>;
  /** Present when an unclaimed invited row already holds the number. */
  pendingMerge?: {
    name: string;
    expenseCount: number;
    netCents: number;
    nets: { currency: string; cents: number }[];
    counterpartyNames: string[];
  };
  /** Signed authorization for ConfirmPhoneMerge; empty unless pendingMerge is set. */
  mergeToken: string;
}

/**
 * Digests the exact facts a merge preview showed, so the confirmation can
 * prove it is absorbing the history the user actually looked at. Sixteen hex
 * characters of SHA-256: not a secret, just a collision-resistant summary.
 *
 * @param preview - The preview as read from the repo.
 * @returns A short stable digest of name, expense count, and per-currency nets.
 */
function previewFingerprint(preview: MergePreviewRow): string {
  const nets = Object.entries(preview.nets ?? {})
    .map(([currency, cents]) => [currency, Number(cents)] as const)
    .sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0));
  return createHash("sha256")
    .update(JSON.stringify([preview.name, preview.expense_count, nets]))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Builds the signed token that carries a pending merge between the two RPCs.
 *
 * Server-side state would need a table and a sweeper; an HMAC over the exact
 * facts being authorized needs neither, and reuses the signing key the
 * session tokens already rely on. Binding keeper, loser and phone means the
 * token cannot be replayed to absorb a different row; binding the preview's
 * fingerprint means it cannot absorb materially different history than the
 * user was shown. The purpose prefix prevents it from validating as a
 * session token or vice versa.
 *
 * @param keeperId - The caller's account.
 * @param loserId - Row that would be absorbed.
 * @param phone - E.164 number being claimed.
 * @param fingerprint - Digest of the preview the user is confirming.
 * @returns Token of the form "keeper.loser.phone.fingerprint.expiry.signature".
 */
function createMergeToken(
  keeperId: string,
  loserId: string,
  phone: string,
  fingerprint: string,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + MERGE_TOKEN_LIFETIME_SECONDS;
  const payload = `${keeperId}.${loserId}.${phone}.${fingerprint}.${expiresAt}`;
  return `${payload}.${signPayload("phone-merge", payload)}`;
}

/**
 * Verifies a merge token and returns what it authorizes.
 *
 * @param token - Token previously issued by {@link createMergeToken}.
 * @param callerId - Authenticated caller, which must match the token's keeper.
 * @returns The loser id, phone, and preview fingerprint the token authorizes.
 * @throws UsecaseError "invalid_argument" when the token is malformed,
 *   expired, tampered with, or was issued to a different account.
 */
function readMergeToken(
  token: string,
  callerId: string,
): { loserId: string; phone: string; fingerprint: string } {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) invalid(STALE_MERGE_TOKEN_MESSAGE);
  const payload = token.slice(0, lastDot);
  if (!verifyPayloadSignature("phone-merge", payload, token.slice(lastDot + 1))) {
    invalid(STALE_MERGE_TOKEN_MESSAGE);
  }
  const fields = payload.split(".");
  if (fields.length !== 5) invalid(STALE_MERGE_TOKEN_MESSAGE);
  const [keeperId, loserId, phone, fingerprint, expiresAtText] = fields;
  const expiresAt = Number(expiresAtText);
  if (
    !keeperId ||
    !loserId ||
    !phone ||
    !fingerprint ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Date.now() / 1000
  ) {
    invalid(STALE_MERGE_TOKEN_MESSAGE);
  }
  // Signature alone would let anyone replay someone else's token; the merge
  // must land on the account that was shown the preview.
  if (keeperId !== callerId) {
    throw new UsecaseError("permission_denied", "that confirmation belongs to another account");
  }
  return { loserId, phone, fingerprint };
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
 * Says a code was wrong and how many tries the verification has left.
 *
 * @param checkCount - Checks spent, this one included.
 * @param expiresAt - When the verification expires, as an ISO timestamp.
 * @returns The refusal; the lockout message once no tries are left.
 */
function wrongCodeMessage(checkCount: number, expiresAt: string): string {
  const triesLeft = MAX_PHONE_CODE_CHECKS - checkCount;
  if (triesLeft <= 0) return lockedOutMessage(expiresAt);
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
 * The send-side lockout, for the handler to ask before it records a send
 * against the number's hourly ceiling: a send refused here must not use one
 * of those up. {@link setPhone} asks again itself.
 *
 * @param userId - Account asking for the code.
 * @param rawPhone - Whatever the user typed.
 * @throws UsecaseError "invalid_argument" for an unparseable number, or while locked out.
 */
export async function assertCodeCanBeSent(userId: string, rawPhone: string): Promise<void> {
  const phone = normalizePhone(rawPhone);
  if (!phone) invalid(PHONE_FORMAT_HINT);
  await refuseSendWhileLockedOut(userId, phone);
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
 * @param userId - Account that sent the code.
 * @param code - The code the provider did not approve.
 * @param attempt - The spent attempt's count and the verification's expiry.
 * @param verdict - What the provider said.
 * @throws UsecaseError "invalid_argument" worded for the verdict, always.
 */
async function refuseCode(
  userId: string,
  code: string,
  attempt: { checkCount: number; expiresAt: string },
  verdict: Exclude<PhoneCodeVerdict, "approved">,
): Promise<never> {
  if (verdict === "gone") {
    // The provider holds nothing to check a code against, so neither does
    // this server: the next send then starts afresh on both sides, instead
    // of keeping a budget and expiry for a verification that is not there.
    await consumePhoneVerification(userId);
    invalid(INACTIVE_CODE_MESSAGE);
  }
  if (verdict === "exhausted") {
    await exhaustPhoneVerification(userId, MAX_PHONE_CODE_CHECKS);
    invalid(lockedOutMessage(attempt.expiresAt));
  }
  logRejectedCode(userId, code, attempt);
  invalid(wrongCodeMessage(attempt.checkCount, attempt.expiresAt));
}

/**
 * Resolves the state of a phone number the caller wants to claim.
 *
 * @param userId - Authenticated caller.
 * @param rawPhone - Whatever the user typed.
 * @param verificationCode - Empty to send an SMS, or the code to confirm possession.
 * @returns The updated user, or a preview plus token when confirmation is needed.
 * @throws UsecaseError "invalid_argument" for an unparseable number or one
 *   already on the caller's own account.
 * @throws UsecaseError "already_exists" when a registered account holds it.
 */
export async function setPhone(
  userId: string,
  rawPhone: string,
  verificationCode: string,
): Promise<SetPhoneResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) invalid(PHONE_FORMAT_HINT);

  if (verificationCode.trim() === "") {
    await refuseSendWhileLockedOut(userId, phone);
    // State first, SMS second: a send the server has no record of would make
    // the delivered code unusable, while a recorded send that failed to
    // deliver just expires. The row also binds the coming check to THIS
    // account and THIS number. A resend while it is live keeps it as it is,
    // the way the provider keeps the verification and its code.
    await beginPhoneVerification(userId, phone, PHONE_VERIFICATION_LIFETIME_SECONDS);
    await startPhoneVerification(phone);
    return { verificationSent: true, mergeToken: "" };
  }
  const code = verificationCode.trim();
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
  if (verdict !== "approved") await refuseCode(userId, code, attempt, verdict);
  // Single-use on our side: a second check of the same approved code finds
  // no verification, whatever the provider would have said.
  await consumePhoneVerification(userId);

  let holder = await findUserByPhone(phone);

  // Free, or already ours: write it and move on. The common case.
  if (!holder || holder.id === userId) {
    try {
      await setUserPhone(userId, phone);
    } catch (error) {
      // TOCTOU: another account may claim the partial-unique phone index
      // between the lookup above and this update. Re-read the winner and feed
      // it through the same claimed-account/merge-preview decisions below.
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
      return { user: toPrivateUser(refreshed), mergeToken: "" };
    }
  }

  // Held by a real account: TRANSFER, not refusal (§34). Numbers move —
  // lost SIMs, temporary SIMs — and possession-by-SMS is the definition of
  // holding one. Safe precisely because a phone here is a directory
  // pointer, never an authenticator (sign-in uses Google or Apple). Absorbing
  // the ACCOUNT would be wrong; moving the NUMBER, with both sides told,
  // is how every messaging app treats it.
  if (isClaimed(holder)) {
    return transferVerifiedPhone(userId, holder, phone);
  }

  // Held by an unclaimed row someone was invited into. Almost certainly the
  // caller's own history, but "almost certainly" is what the preview is for.
  const preview = await previewMerge(holder.id);
  if (!preview) throw new UsecaseError("not_found", "that invitation no longer exists");
  // One bucket per currency, each checked against the wire's int32 before
  // it is promised to a client.
  const nets = Object.entries(preview.nets ?? {}).map(([currency, cents]) => ({
    currency,
    cents: toInt32Cents(Number(cents), "that account's balance"),
  }));
  const defaultCurrency = (await findUserById(userId))?.default_currency || "USD";
  // The preview is a disclosure — a recycled number's current holder learns
  // who the previous holder split money with. It is the defense recycled
  // numbers need, but it should be findable in the log and no larger than
  // the decision requires.
  logEvent("info", "merge preview disclosed after SMS verification", {
    keeperId: userId,
    loserId: holder.id,
  });
  return {
    pendingMerge: {
      name: preview.name,
      expenseCount: preview.expense_count,
      netCents: nets.find((bucket) => bucket.currency === defaultCurrency)?.cents ?? 0,
      nets,
      counterpartyNames: preview.counterparty_names.slice(0, MAX_PREVIEW_COUNTERPARTY_NAMES),
    },
    mergeToken: createMergeToken(userId, holder.id, phone, previewFingerprint(preview)),
  };
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
    // Both rows locked in sorted order, like the merge path, so a competing
    // transfer or merge serializes instead of deadlocking.
    await client.query(`SELECT id FROM users WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`, [
      [claimantId, holder.id].sort(),
    ]);
    const current = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND phone = $2 AND merged_into IS NULL`,
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
  return { user: toPrivateUser(refreshed), mergeToken: "" };
}

/**
 * Whether a row belongs to someone who has actually signed in, as opposed to
 * an invitation waiting to be claimed.
 *
 * @param user - Row to classify.
 * @returns True when either credential is set.
 */
function isClaimed(user: UserRow): boolean {
  return isRegisteredUser(user);
}

/**
 * Performs the merge a previous SetPhone offered.
 *
 * The holder is re-read and re-checked rather than trusted from the token: the
 * row could have been claimed by its rightful owner in the seconds since the
 * preview, and absorbing it then would take a live account.
 *
 * @param userId - Authenticated caller, who keeps their account.
 * @param mergeToken - Token handed back by {@link setPhone}.
 * @returns The caller's account after absorbing the invited row.
 * @throws UsecaseError "invalid_argument" when the token is stale or forged.
 * @throws UsecaseError "already_exists" when the row was claimed in the meantime.
 */
export async function confirmPhoneMerge(userId: string, mergeToken: string) {
  const { loserId, phone, fingerprint } = readMergeToken(mergeToken, userId);

  const loser = await findUserById(loserId);
  if (!loser || loser.merged_into !== null) {
    throw new UsecaseError("not_found", "that invitation no longer exists");
  }
  if (isClaimed(loser)) {
    throw new UsecaseError("already_exists", "that number is already on another account");
  }
  if (loser.phone !== phone) {
    invalid(STALE_MERGE_TOKEN_MESSAGE);
  }
  // The user is confirming the history they were SHOWN. If an expense landed
  // on the invited row inside the token's ten minutes, the preview they read
  // is no longer what they would absorb — send them back to look again
  // rather than merging a different set of numbers.
  const currentPreview = await previewMerge(loserId);
  if (!currentPreview || previewFingerprint(currentPreview) !== fingerprint) {
    invalid("that account's balances changed since the preview — please review it again");
  }

  // Possession of this exact number was proven seconds ago — the one path
  // where adopting it onto the keeper is earned.
  await mergeAccounts(userId, loserId, phone, { adoptPhone: true });

  const merged = await findUserById(userId);
  if (!merged) throw new UsecaseError("unauthenticated", "account no longer exists");
  return toPrivateUser(merged);
}
