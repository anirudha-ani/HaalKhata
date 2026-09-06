/** Deterministic transaction-scoped advisory locks: money ledgers, reminders, friend-request inboxes. */

import type { PoolClient } from "pg";
import { transaction } from "@/server/common/db";
import {
  EXPENSE_LEDGER_LOCK_PREFIX,
  FRIEND_REQUEST_INBOX_LOCK_PREFIX,
  GROUP_LEDGER_LOCK_PREFIX,
  PARTICIPANT_LEDGER_LOCK_PREFIX,
  REMINDER_LOCK_PREFIX,
} from "@/server/common/ledgerLocks.constants";

/**
 * Acquires advisory locks for already-normalized keys in lexical order.
 *
 * @param client - Transaction client that must retain the locks through commit.
 * @param lockKeys - Distinct lock names; duplicates are removed defensively.
 * @returns A promise that resolves after every lock is held.
 */
async function acquireKeys(client: PoolClient, lockKeys: string[]): Promise<void> {
  for (const lockKey of [...new Set(lockKeys)].sort()) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
  }
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
 * Account merges take these same locks, in the same sorted order, before
 * their row locks on users — the one order every path takes them in.
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
 * Runs a ledger mutation in one transaction. Callers acquire participant
 * locks before group locks if both are needed; every lock is released by
 * commit/rollback.
 *
 * @param operation - Lock acquisition, validation, and writes on one client.
 * @returns The operation's committed result.
 */
export async function withLedgerTransaction<Outcome>(
  operation: (client: PoolClient) => Promise<Outcome>,
): Promise<Outcome> {
  return transaction(operation);
}
