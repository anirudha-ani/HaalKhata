/** Parameterized SQL for blocking, authorized report targets, and the moderation queue. */

import type { PoolClient } from "pg";
import { execute, newId, query, queryOne } from "@/server/common/db";
import type { UserRow } from "@/server/auth/repo/users.repo";

/** Server-owned report context; caller cannot supply or alter the snapshot. */
export interface ReportTarget { author_id: string; snapshot: Record<string, unknown>; }

/**
 * Checks whether either person has blocked the other.
 * @param firstId First account.
 * @param secondId Second account.
 * @param client Optional transaction.
 * @returns Whether interactions should be refused.
 */
export async function blockedBetween(firstId: string, secondId: string, client?: PoolClient): Promise<boolean> {
  return Boolean(await queryOne(`SELECT 1 FROM user_blocks WHERE
    (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`, [firstId, secondId], client));
}

/**
 * Finds a public account already connected through a friendship or shared ledger/group.
 * @param viewerId Caller.
 * @param targetId Visible account.
 * @returns Whether the caller has an existing context for that account.
 */
export async function visibleUser(viewerId: string, targetId: string): Promise<boolean> {
  return Boolean(await queryOne(`SELECT 1 FROM users target WHERE target.id = $2 AND target.deleted_at IS NULL AND (
    EXISTS (SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2) OR
    EXISTS (SELECT 1 FROM friend_requests WHERE (requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1)) OR
    EXISTS (SELECT 1 FROM group_members viewer JOIN group_members other USING(group_id) WHERE viewer.user_id = $1 AND other.user_id = $2) OR
    EXISTS (SELECT 1 FROM expense_splits viewer JOIN expense_splits other USING(expense_id) WHERE viewer.user_id = $1 AND other.user_id = $2) OR
    EXISTS (SELECT 1 FROM expense_payers viewer JOIN expense_splits other USING(expense_id) WHERE viewer.user_id = $1 AND other.user_id = $2) OR
    EXISTS (SELECT 1 FROM expense_splits viewer JOIN expense_payers other USING(expense_id) WHERE viewer.user_id = $1 AND other.user_id = $2)
  )`, [viewerId, targetId]));
}

/**
 * Reads comment context for authorization through its owning expense.
 * @param targetId Comment id.
 * @returns Stored author, body and expense, if present.
 */
export async function commentTarget(targetId: string) {
  return queryOne<{ user_id: string; body: string; expense_id: string }>("SELECT user_id, body, expense_id FROM comments WHERE id = $1", [targetId]);
}

/**
 * Blocks one account and clears pending contact and existing notification messages.
 * @param viewerId Blocker.
 * @param targetId Blocked account.
 * @param client Transaction client.
 */
export async function insertBlock(viewerId: string, targetId: string, client: PoolClient): Promise<void> {
  await execute("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [viewerId, targetId], client);
  await execute(`DELETE FROM friend_requests WHERE (requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1)`, [viewerId, targetId], client);
  // Legacy rows have no actor metadata; clearing the blocker's notification inbox
  // removes pre-migration abusive messages without guessing their authors.
  await execute("DELETE FROM notifications WHERE user_id = $1 OR (user_id = $2 AND actor_id = $1)", [viewerId, targetId], client);
}

/**
 * Removes only the caller's own block.
 * @param viewerId Blocker.
 * @param targetId Previously blocked account.
 */
export async function removeBlock(viewerId: string, targetId: string): Promise<void> {
  await execute("DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2", [viewerId, targetId]);
}

/**
 * Lists accounts blocked by the caller.
 * @param viewerId Caller.
 * @returns Public profiles, ordered by name.
 */
export function listBlocks(viewerId: string): Promise<UserRow[]> {
  return query<UserRow>("SELECT users.* FROM user_blocks JOIN users ON users.id = blocked_id WHERE blocker_id = $1 ORDER BY users.name, users.id", [viewerId]);
}

/**
 * Stores a private, deduplicated report with a server-generated content snapshot.
 * @param viewerId Reporter.
 * @param input Validated report context.
 */
export async function insertReport(viewerId: string, input: { targetKind: string; targetId: string; reason: string; target: ReportTarget }): Promise<void> {
  await execute(`INSERT INTO content_reports (id, reporter_id, reported_user_id, target_kind, target_id, reason, snapshot)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT DO NOTHING`,
    [newId(), viewerId, input.target.author_id, input.targetKind, input.targetId, input.reason, JSON.stringify(input.target.snapshot)]);
}

/**
 * Checks all prospective participants in one indexed lookup.
 * @param userIds Accounts about to share a new expense/group.
 * @param existingIds Existing expense participants whose history may still be corrected.
 * @returns Whether any new pair has blocked contact.
 */
export async function blockedPairExists(userIds: string[], existingIds: string[] = []): Promise<boolean> {
  return Boolean(await queryOne("SELECT 1 FROM user_blocks WHERE blocker_id = ANY($1::text[]) AND blocked_id = ANY($1::text[]) AND NOT (blocker_id = ANY($2::text[]) AND blocked_id = ANY($2::text[])) LIMIT 1", [userIds, existingIds]));
}
