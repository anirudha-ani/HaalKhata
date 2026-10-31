/**
 * A payment whose outcome is not known yet. When the reply to recording one is
 * lost, the server may or may not have saved it, and only sending that exact
 * request again can find out: the server answers a repeat with the first
 * recording, never a second one. So the attempt is kept, unchanged, until
 * something settles it, and nothing else can be recorded with that person in
 * the meantime. It is kept in memory only, like every other figure the apps
 * hold, and goes with the session.
 */

import { Code, ConnectError } from "@connectrpc/connect";

/** How often an unresolved payment is asked about while its dialog is open. */
export const SETTLE_CHECK_INTERVAL_MS = 10_000;

/**
 * How long a repeat can be trusted. The server forgets an operation after a
 * day and would then record it as new, so an attempt stops being sent well
 * before that.
 */
export const SETTLE_ATTEMPT_LIFETIME_MS = 23 * 60 * 60 * 1000;

/** Said while an unresolved payment is being asked about. */
export const SETTLE_CHECKING_MESSAGE = "Checking whether it was recorded…";

/** Said when the server would not take a repeat, so an earlier attempt may have been saved. */
export const SETTLE_MAY_HAVE_LANDED_MESSAGE =
  "An earlier attempt may have gone through. Check the balance above before recording anything else.";

/** Said when an unresolved payment is too old to ask about safely. */
export const SETTLE_ATTEMPT_TOO_OLD_MESSAGE =
  "We couldn’t confirm your earlier payment in time. Check the balance above before recording it again.";

/** One attempt at recording a payment, exactly as it was sent. */
export interface SettleAttempt<Request = unknown> {
  /** The whole request, id included: a repeat must match it exactly. */
  request: Request;
  /** The amount, formatted, for saying what this is about. */
  amountLabel: string;
  /** When it was first sent, in milliseconds. */
  startedAt: number;
}

/** What a failed attempt says about whether the payment was saved. */
export type SettleFailure = "notRecorded" | "unknown" | "mayHaveLanded";

/**
 * The refusals that mean nothing was saved. The server checks for a repeat
 * before it refuses anything, so one of these answers the attempt itself as
 * well as this one sending. Everything else leaves it open, even a rate limit:
 * that says this repeat was not looked at, not that the first was not saved.
 */
const NOT_RECORDED_CODES: ReadonlySet<Code> = new Set([
  Code.InvalidArgument,
  Code.FailedPrecondition,
  Code.NotFound,
  Code.PermissionDenied,
  Code.OutOfRange,
]);

/** Attempts with no answer yet, by the person they are with. */
const unresolved = new Map<string, SettleAttempt>();

/**
 * Reads a failure.
 *
 * @param failure - What recording threw.
 * @returns What it says about the payment.
 */
export function readSettleFailure(failure: unknown): SettleFailure {
  if (!(failure instanceof ConnectError)) return "unknown";
  if (failure.code === Code.AlreadyExists) return "mayHaveLanded";
  return NOT_RECORDED_CODES.has(failure.code) ? "notRecorded" : "unknown";
}

/**
 * Keeps an attempt until it has an answer.
 *
 * @param personId - Who the payment is with.
 * @param attempt - The attempt.
 */
export function rememberSettleAttempt(personId: string, attempt: SettleAttempt): void {
  unresolved.set(personId, attempt);
}

/**
 * The attempt waiting for an answer with somebody.
 *
 * @param personId - Who.
 * @returns The attempt, or null when there is none.
 */
export function settleAttemptFor<Request>(personId: string): SettleAttempt<Request> | null {
  return (unresolved.get(personId) as SettleAttempt<Request> | undefined) ?? null;
}

/**
 * Lets go of an attempt that has its answer.
 *
 * @param personId - Who it was with.
 */
export function forgetSettleAttempt(personId: string): void {
  unresolved.delete(personId);
}

/** Lets go of every attempt: the account they belong to has gone from this device. */
export function forgetAllSettleAttempts(): void {
  unresolved.clear();
}

/**
 * Whether an attempt is too old to send again.
 *
 * @param attempt - The attempt.
 * @param clock - The time now, in milliseconds.
 * @returns True once the server may have forgotten it.
 */
export function isSettleAttemptTooOld(attempt: SettleAttempt, clock: number): boolean {
  return clock - attempt.startedAt >= SETTLE_ATTEMPT_LIFETIME_MS;
}

/**
 * Says a payment's outcome is not known, and what not to do meanwhile.
 *
 * @param amountLabel - The amount, formatted.
 * @returns The sentence.
 */
export function settleUnsureMessage(amountLabel: string): string {
  return `We can’t tell yet whether your ${amountLabel} payment was recorded. We’ll keep checking, so please don’t record it again.`;
}

/**
 * Says a payment that seemed lost was saved after all.
 *
 * @param amountLabel - The amount, formatted.
 * @returns The sentence.
 */
export function settleRecordedMessage(amountLabel: string): string {
  return `Your ${amountLabel} payment was recorded.`;
}

/**
 * Says a payment that seemed lost was not saved, and why.
 *
 * @param amountLabel - The amount, formatted.
 * @param reason - The server's reason.
 * @returns The sentence.
 */
export function settleNotRecordedMessage(amountLabel: string, reason: string): string {
  return `Your ${amountLabel} payment wasn’t recorded: ${reason}`;
}
