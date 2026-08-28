/** Deterministic transaction-scoped advisory locks for money-ledger mutations. */

import type { PoolClient } from "pg";
import { transaction } from "@/server/common/db";
import {
  EXPENSE_LEDGER_LOCK_PREFIX,
  GROUP_LEDGER_LOCK_PREFIX,
  PAIR_LEDGER_LOCK_PREFIX,
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
 * Acquires every unordered pair lock among a set of participants.
 *
 * @param client - Existing transaction client.
 * @param userIds - Participants whose one-off pair ledgers may change.
 * @returns A promise that resolves after every pair lock is held.
 */
export async function lockPairLedgers(client: PoolClient, userIds: string[]): Promise<void> {
  const sortedUserIds = [...new Set(userIds)].sort();
  const lockKeys: string[] = [];
  for (let firstIndex = 0; firstIndex < sortedUserIds.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < sortedUserIds.length; secondIndex += 1) {
      lockKeys.push(
        `${PAIR_LEDGER_LOCK_PREFIX}${sortedUserIds[firstIndex]}|${sortedUserIds[secondIndex]}`,
      );
    }
  }
  await acquireKeys(client, lockKeys);
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
 * Runs a ledger mutation in one transaction. Callers acquire pair locks before
 * group locks if both are needed; every lock is released by commit/rollback.
 *
 * @param operation - Lock acquisition, validation, and writes on one client.
 * @returns The operation's committed result.
 */
export async function withLedgerTransaction<Outcome>(
  operation: (client: PoolClient) => Promise<Outcome>,
): Promise<Outcome> {
  return transaction(operation);
}
