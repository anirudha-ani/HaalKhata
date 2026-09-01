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
} from "@/server/auth/repo/accountMerge.repo";
import {
  beginPhoneVerification,
  consumePhoneVerification,
  spendPhoneCheckAttempt,
} from "@/server/auth/repo/phoneVerifications.repo";
import { createHash } from "node:crypto";
import { isUniqueViolation } from "@/server/common/db";
import { logEvent } from "@/server/common/logger";
import { UsecaseError, invalid } from "@/server/common/errors";
import { toInt32Cents } from "@/server/common/money";
import {
  MAX_PHONE_CODE_CHECKS,
  MAX_PREVIEW_COUNTERPARTY_NAMES,
  MERGE_TOKEN_LIFETIME_SECONDS,
  PHONE_FORMAT_HINT,
  PHONE_VERIFICATION_LIFETIME_SECONDS,
  normalizePhone,
} from "@/server/auth/auth.constants";
import { signPayload, verifyPayloadSignature } from "./auth.usecase";

/** One message for every failed merge-token check: expired, forged, and malformed all just mean "start over". */
const STALE_MERGE_TOKEN_MESSAGE = "that confirmation is no longer valid, please try again";
import { toPrivateUser } from "./user.mapper";
import { confirmPhoneVerification, startPhoneVerification } from "./phoneVerification";

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
    // State first, SMS second: a send the server has no record of would make
    // the delivered code unusable, while a recorded send that failed to
    // deliver just expires. The row also binds the coming check to THIS
    // account and THIS number.
    await beginPhoneVerification(userId, phone, PHONE_VERIFICATION_LIFETIME_SECONDS);
    await startPhoneVerification(phone);
    return { verificationSent: true, mergeToken: "" };
  }
  // Spend an attempt before the provider is consulted: the budget is this
  // server's own (OWASP's 3–5 band), not an inherited provider behavior, and
  // an attempt consumed by a crash mid-check stays consumed.
  const attempt = await spendPhoneCheckAttempt(userId, phone, MAX_PHONE_CODE_CHECKS);
  if (attempt === "no_verification") {
    invalid("that code is no longer active — request a new one");
  }
  if (attempt === "exhausted") {
    invalid("too many incorrect codes — request a new one");
  }
  await confirmPhoneVerification(phone, verificationCode.trim());
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

  // Held by a real account. Recycled number or a typo — either way a person
  // has to sort it out, and absorbing someone's live account is never right.
  if (isClaimed(holder)) {
    throw new UsecaseError(
      "already_exists",
      "that number is already on another account — get in touch if it should be yours",
    );
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
 * Whether a row belongs to someone who has actually signed in, as opposed to
 * an invitation waiting to be claimed.
 *
 * @param user - Row to classify.
 * @returns True when either credential is set.
 */
function isClaimed(user: UserRow): boolean {
  return user.password_hash !== null || user.google_sub !== null;
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

  await mergeAccounts(userId, loserId, phone);

  const merged = await findUserById(userId);
  if (!merged) throw new UsecaseError("unauthenticated", "account no longer exists");
  return toPrivateUser(merged);
}
