/** Deterministic transaction-scoped advisory locks: money ledgers, reminders, friend-request inboxes, payment methods. */

import type { PoolClient } from "pg";
import { transaction } from "@/server/common/db/db";
import { unavailable } from "@/server/common/errors";
import {
  EXPENSE_LEDGER_LOCK_PREFIX,
  FRIEND_REQUEST_INBOX_LOCK_PREFIX,
  GROUP_LEDGER_LOCK_PREFIX,
  LEDGER_BUSY_MESSAGE,
  LEDGER_LOCK_TIMEOUT_MS,
  LEDGER_STATEMENT_TIMEOUT_MS,
  LEDGER_BUSY_ERROR_CODES,
  PARTICIPANT_LEDGER_LOCK_PREFIX,
  PAYMENT_METHODS_LOCK_PREFIX,
  REMINDER_LOCK_PREFIX,
} from "@/server/common/ledger/ledgerLocks.constants";

/**
 * Acquires advisory locks for already-normalized keys in lexical order, in
 * one statement: a request that locks a hundred people waits on one round
 * trip, not a hundred.
 *
 * The order is what keeps two requests from waiting on each other, so it
 * is the sort's: PostgreSQL calls a volatile function in the select list
 * after ORDER BY has sorted the rows, one row at a time. `COLLATE "C"`
 * sorts by bytes, which for these ASCII keys is the order JavaScript's sort
 * gave them when each lock was its own statement, so a release still
 * locking that way agrees with this one during a deploy.
 *
 * @param client - Transaction client that must retain the locks through commit.
 * @param lockKeys - Distinct lock names; duplicates are removed defensively.
 * @returns A promise that resolves after every lock is held.
 */
async function acquireKeys(client: PoolClient, lockKeys: string[]): Promise<void> {
  const distinctKeys = [...new Set(lockKeys)];
  if (distinctKeys.length === 0) return;
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))
       FROM unnest($1::text[]) AS lock_key
      ORDER BY lock_key COLLATE "C"`,
    [distinctKeys],
  );
}

/**
 * Acquires group-ledger locks in deterministic order.
 *
 * @param client - Existing transaction client.
 * @param groupIds - Group ids whose money or membership state will be read-then-written.
 * @returns A promise that resolves after every group lock is held.
 */
export async function lockGroupLedgers(client: PoolClient, groupIds: string[]): Promise<void> {
  await acquireKeys(
    client,
    groupIds.filter(Boolean).map((groupId) => `${GROUP_LEDGER_LOCK_PREFIX}${groupId}`),
  );
}

/**
 * Acquires one lock per participant of a one-off ledger mutation.
 *
 * One lock per person rather than one per unordered pair. A pair set is
 * quadratic in the cast: a 100-participant one-off expense (the request
 * ceiling) would take 4,950 heavyweight locks, more than the whole server's
 * lock table holds under the production `max_connections`, so Postgres would
 * fail the statement with "out of shared memory" and starve every other
 * transaction while the locks piled up. Per-participant locks are a superset
 * of the pair exclusion — any two mutations that share a person serialize —
 * and grow linearly with the cast. Sorted acquisition keeps them
 * deadlock-free, as with every other lock class here.
 *
 * @param client - Existing transaction client.
 * @param userIds - Participants whose one-off ledgers may change.
 * @returns A promise that resolves after every participant lock is held.
 */
export async function lockParticipantLedgers(
  client: PoolClient,
  userIds: string[],
): Promise<void> {
  await acquireKeys(
    client,
    userIds.filter(Boolean).map((userId) => `${PARTICIPANT_LEDGER_LOCK_PREFIX}${userId}`),
  );
}

/**
 * Serializes competing mutations of one expense while its scope locks are selected.
 *
 * @param client - Existing transaction client.
 * @param expenseId - Expense row being updated or deleted.
 * @returns A promise that resolves after the expense lock is held.
 */
export async function lockExpenseLedger(client: PoolClient, expenseId: string): Promise<void> {
  await acquireKeys(client, [`${EXPENSE_LEDGER_LOCK_PREFIX}${expenseId}`]);
}

/**
 * Serializes reminders from one person to another, so the cooldown check
 * and the insert that follows it cannot interleave with a concurrent send.
 *
 * @param client - Existing transaction client.
 * @param senderId - Who is reminding.
 * @param debtorId - Who is being reminded.
 * @returns A promise that resolves after the pair's reminder lock is held.
 */
export async function lockReminder(
  client: PoolClient,
  senderId: string,
  debtorId: string,
): Promise<void> {
  await acquireKeys(client, [`${REMINDER_LOCK_PREFIX}${senderId}:${debtorId}`]);
}

/**
 * Serializes pending-request and friendship changes for a deterministic set
 * of inboxes, preventing accept/send races from recreating stale requests.
 * A path that also needs ledger locks (group or participant) takes those
 * first and these second — a one-off expense befriending its participants,
 * a group enrolment, a friend removal — so no two paths can each hold one
 * kind while waiting for the other.
 *
 * @param client - Existing transaction client.
 * @param userIds - Inbox owner ids to lock, in any order.
 * @returns A promise that resolves after every inbox lock is held.
 */
export async function lockFriendRequestInboxes(
  client: PoolClient,
  userIds: string[],
): Promise<void> {
  await acquireKeys(
    client,
    userIds.filter(Boolean).map((userId) => `${FRIEND_REQUEST_INBOX_LOCK_PREFIX}${userId}`),
  );
}

/**
 * Serializes changes to one person's payment methods, so the count behind
 * the cap and the star being moved cannot change between being read and
 * being written.
 *
 * @param client - Existing transaction client.
 * @param userId - Owner of the methods being changed.
 * @returns A promise that resolves after the owner's lock is held.
 */
export async function lockPaymentMethods(client: PoolClient, userId: string): Promise<void> {
  await acquireKeys(client, [`${PAYMENT_METHODS_LOCK_PREFIX}${userId}`]);
}

/**
 * Whether an error is Postgres giving up on a ledger change: a lock wait or
 * a statement past the ledger's time limits, or a deadlock it broke.
 *
 * @param error - Anything thrown inside a ledger transaction.
 * @returns True for a lock timeout, a statement timeout or a deadlock.
 */
function isLedgerBusy(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && LEDGER_BUSY_ERROR_CODES.has(code);
}

/**
 * Runs a ledger mutation in one transaction. Callers acquire participant
 * locks before group locks if both are needed; every lock is released by
 * commit/rollback.
 *
 * The transaction waits at most {@link LEDGER_LOCK_TIMEOUT_MS} for any lock
 * and runs no statement longer than {@link LEDGER_STATEMENT_TIMEOUT_MS}
 * (`SET LOCAL`, so the pooled connection is back to normal after it). Either
 * limit, or a deadlock Postgres breaks by cancelling this transaction, rolls
 * everything back and tells the person nothing was saved.
 *
 * @param operation - Lock acquisition, validation, and writes on one client.
 * @returns The operation's committed result.
 * @throws UsecaseError (unavailable) when a lock or statement ran out of
 *   time, or the transaction was chosen to end a deadlock.
 */
export async function withLedgerTransaction<Outcome>(
  operation: (client: PoolClient) => Promise<Outcome>,
): Promise<Outcome> {
  return transaction(async (client) => {
    await client.query("SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true)", [
      `${LEDGER_LOCK_TIMEOUT_MS}ms`,
      `${LEDGER_STATEMENT_TIMEOUT_MS}ms`,
    ]);
    try {
      return await operation(client);
    } catch (error) {
      if (isLedgerBusy(error)) unavailable(LEDGER_BUSY_MESSAGE);
      throw error;
    }
  });
}
