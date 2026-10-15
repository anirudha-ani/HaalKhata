/** SQL for irreversible account erasure and anonymous shared-ledger references. */

import type { PoolClient } from "pg";
import { execute, query, queryOne } from "@/server/common/db/db";
import type { UserRow } from "../users.repo";

/**
 * Locks a live account against concurrent provider linking and profile changes.
 * @param userId Authenticated account being deleted.
 * @param client Erasure transaction.
 * @returns Live account or undefined.
 */
export async function lockAccountForDeletion(userId: string, client: PoolClient) {
  return queryOne<UserRow>("SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL AND merged_into IS NULL FOR UPDATE", [userId], client);
}

/**
 * Lists groups created by the account and their remaining active members.
 * @param userId Account being deleted.
 * @param client Erasure transaction.
 * @returns Candidate membership rows ordered by join date and id.
 */
export async function listDeletionGroupMembers(userId: string, client: PoolClient) {
  return query<UserRow & { group_id: string }>(`SELECT members.group_id, candidate.* FROM group_members members
    JOIN users candidate ON candidate.id = members.user_id
    JOIN groups owned ON owned.id = members.group_id
    WHERE owned.created_by = $1 AND candidate.id <> $1 AND candidate.deleted_at IS NULL AND candidate.merged_into IS NULL
    ORDER BY members.joined_at, candidate.id`, [userId], client);
}

/**
 * Transfers group ownership to the usecase-selected surviving member.
 * @param groupId Group whose creator account is being erased.
 * @param userId Surviving owner.
 * @param client Erasure transaction.
 */
export async function transferDeletionGroupOwnership(groupId: string, userId: string, groupName: string, client: PoolClient): Promise<void> {
  await execute("UPDATE groups SET created_by = $2, name = $3 WHERE id = $1", [groupId, userId, groupName], client);
  await execute("UPDATE group_members SET role = CASE WHEN user_id = $2 THEN 'owner' ELSE 'member' END WHERE group_id = $1", [groupId, userId], client);
}

/**
 * Creates a new identity-free participant; it has no provider or contact credential.
 * @param participant Anonymous id, display name and neutral color selected by the usecase.
 * @param client Erasure transaction.
 */
export async function insertAnonymousLedgerMember(participant: { id: string; name: string; color: string }, client: PoolClient): Promise<void> {
  await execute(`INSERT INTO users (id, name, avatar_color, deleted_at)
    VALUES ($1, $2, $3, NOW())`, [participant.id, participant.name, participant.color], client);
}

/**
 * Erases personal content and credentials and repoints only shared ledger rows.
 * Every statement uses the same transaction; a future unhandled FK fails the
 * final DELETE and rolls back instead of partially erasing the account.
 * @param input Account id, new anonymous id and replacement labels.
 * @param client Erasure transaction.
 */
export async function eraseAccountData(input: { userId: string; anonymousId: string; oldName: string;
  anonymousName: string; expenseDescription: string; itemName: string; groupName: string }, client: PoolClient): Promise<void> {
  const identity = [input.userId, input.anonymousId];
  await execute(`DELETE FROM notifications WHERE user_id = $1 OR link IN
    (SELECT link FROM activity WHERE actor_id = $1 OR credit_user_id = $1 OR audience @> jsonb_build_array($1::text))`, [input.userId], client);
  await execute(`UPDATE notifications SET title = replace(title, $1, $2), body = replace(body, $1, $2)
    WHERE strpos(title, $1) > 0 OR strpos(body, $1) > 0`, [input.oldName, input.anonymousName], client);
  await execute("DELETE FROM activity WHERE actor_id = $1 OR credit_user_id = $1 OR audience @> jsonb_build_array($1::text)", [input.userId], client);
  await execute("DELETE FROM comments WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1", [input.userId], client);
  await execute("DELETE FROM friend_requests WHERE requester_id = $1 OR recipient_id = $1", [input.userId], client);
  await execute("DELETE FROM invite_links WHERE inviter_id = $1 OR invited_user_id = $1", [input.userId], client);
  await execute("DELETE FROM phone_verifications WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM operations WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM apple_sign_in_challenges WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM apple_credentials WHERE user_id = $1", [input.userId], client);
  await execute(`DELETE FROM payment_handles WHERE user_id = $1 OR user_id IN
    (SELECT id FROM users WHERE merged_into = $1)`, [input.userId], client);
  await execute(`UPDATE expense_items SET name = $2 WHERE expense_id IN
    (SELECT id FROM expenses WHERE created_by = $1)`, [input.userId, input.itemName], client);
  await execute("UPDATE expenses SET description = $2, notes = '' WHERE created_by = $1", [input.userId, input.expenseDescription], client);
  await execute("UPDATE groups SET name = $2 WHERE created_by = $1", [input.userId, input.groupName], client);
  await execute("UPDATE settlements SET note = '', method_label = '' WHERE from_user = $1 OR to_user = $1 OR recorded_by = $1", [input.userId], client);
  await execute("UPDATE expense_payers SET user_id = $2 WHERE user_id = $1", identity, client);
  await execute("UPDATE expense_splits SET user_id = $2 WHERE user_id = $1", identity, client);
  await execute("UPDATE expense_item_assignments SET user_id = $2 WHERE user_id = $1", identity, client);
  await execute("UPDATE group_members SET user_id = $2 WHERE user_id = $1", identity, client);
  await execute("UPDATE expenses SET created_by = $2 WHERE created_by = $1", identity, client);
  await execute("UPDATE expenses SET deleted_by = $2 WHERE deleted_by = $1", identity, client);
  await execute("UPDATE settlements SET from_user = $2 WHERE from_user = $1", identity, client);
  await execute("UPDATE settlements SET to_user = $2 WHERE to_user = $1", identity, client);
  await execute("UPDATE settlements SET recorded_by = $2 WHERE recorded_by = $1", identity, client);
  await execute("UPDATE settlements SET deleted_by = $2 WHERE deleted_by = $1", identity, client);
  await execute("UPDATE groups SET created_by = $2 WHERE created_by = $1", identity, client);
  // Merge tombstones also contain historical display names. Break their link
  // to the original account and erase those identity columns in the same write.
  await execute(`UPDATE users SET merged_into = $2, name = $3, email = NULL, phone = NULL, phone_verified_at = NULL,
    password_hash = NULL, google_sub = NULL, apple_sub = NULL, avatar_url = NULL, deleted_at = NOW(), token_version = token_version + 1
    WHERE merged_into = $1`, [input.userId, input.anonymousId, input.anonymousName], client);
  await execute("DELETE FROM users WHERE id = $1", [input.userId], client);
}
