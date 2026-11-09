/** Coordinate account erasure with the payment transactions that copy bill titles. */

import type { PoolClient } from "pg";
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
 * @returns Resolves once concurrent erasure has finished.
 */
export async function lockExpenseTitleForPayment(client: PoolClient, expenseId: string): Promise<void> {
  const authors = await client.query<{ created_by: string }>("SELECT created_by FROM expenses WHERE id = $1", [expenseId]);
  const author = authors.rows[0];
  if (!author) return;
  await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))", [
    `${ACCOUNT_CONTENT_LOCK_PREFIX}${author.created_by}`,
  ]);
}
