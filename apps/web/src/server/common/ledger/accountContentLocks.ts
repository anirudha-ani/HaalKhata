/** Coordinate account erasure with the payment transactions that copy bill titles. */

import type { PoolClient } from "pg";
import { UsecaseError } from "@/server/common/errors";
import { LEDGER_BUSY_MESSAGE } from "./ledgerLocks.constants";
import { ACCOUNT_CONTENT_LOCK_PREFIX } from "./accountContent.constants";

/**
 * Excludes new title copies before erasure takes the account's row lock.
 * @param client Erasure transaction.
 * @param userId Author whose content is being erased.
 * @returns Resolves after in-flight title copies have committed or rolled back.
 */
export async function lockAccountContentForErasure(client: PoolClient, userId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `${ACCOUNT_CONTENT_LOCK_PREFIX}${userId}`,
  ]);
}

/**
 * Keeps an expense author's content from being erased during a payment write.
 * Read the bill again after this returns: erasure may have replaced its author
 * and title while this request waited. Acquire this guard before the bill lock,
 * so a payment cannot hold up moderation while waiting for account erasure.
 * @param client Payment transaction.
 * @param expenseId Bill whose title will be copied by the authoritative read.
 * A payment claim already holds a foreign-key lock on its caller. Waiting
 * here could deadlock with erasure waiting for that same account row.
 * @returns Resolves if the title can be copied; otherwise refuses as busy.
 */
export async function lockExpenseTitleForPayment(client: PoolClient, expenseId: string): Promise<void> {
  const authors = await client.query<{ created_by: string }>("SELECT created_by FROM expenses WHERE id = $1", [expenseId]);
  const author = authors.rows[0];
  if (!author) return;
  const acquired = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1, 0)) AS acquired", [
    `${ACCOUNT_CONTENT_LOCK_PREFIX}${author.created_by}`,
  ]);
  if (!acquired.rows[0].acquired) throw new UsecaseError("unavailable", LEDGER_BUSY_MESSAGE);
}
