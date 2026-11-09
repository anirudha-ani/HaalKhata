/** SQL for irreversible account erasure and anonymous shared-ledger references. */

import type { PoolClient } from "pg";
import { execute, query, queryOne } from "@/server/common/db/db";
import type { UserRow } from "../users.repo";

/**
 * Locks reports that deletion will cascade, before account/content mutations.
 * The id order matches moderation's report locks.
 * @param userId Account whose reports will be removed.
 * @param client Erasure transaction.
 * @returns Report ids held until commit or rollback.
 */
export async function lockDeletionReports(userId: string, client: PoolClient): Promise<string[]> {
  const reports = await query<{ id: string }>(`SELECT id FROM content_reports
    WHERE reporter_id = $1 OR reported_user_id = $1 ORDER BY id FOR UPDATE`, [userId], client);
  return reports.map((report) => report.id);
}

/**
 * Detects reports committed before the account row was locked but after the
 * initial report lock. Its FK lock prevents new reports after this check.
 * @param userId Account locked for deletion.
 * @param reportIds Reports already locked by this transaction.
 * @param client Erasure transaction holding the account row.
 * @returns Whether all reports the final cascade can touch are locked.
 */
export async function deletionReportsUnchanged(userId: string, reportIds: string[], client: PoolClient): Promise<boolean> {
  return await queryOne(`SELECT id FROM content_reports
    WHERE (reporter_id = $1 OR reported_user_id = $1) AND NOT (id = ANY($2::text[]))
    LIMIT 1`, [userId, reportIds], client) === undefined;
}

/**
 * Locks the account and all bill parents that erasure can rewrite.
 * Parent locks are acquired without waiting before any provider revocation,
 * so later child refreshes cannot encounter a parent/child lock inversion.
 * @param userId Authenticated account being deleted.
 * @param client Erasure transaction.
 * @returns Live account or undefined.
 */
export async function lockAccountForDeletion(userId: string, client: PoolClient) {
  const account = await queryOne<UserRow>("SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [userId], client);
  if (account) {
    await query(`SELECT id FROM expenses WHERE id IN (
      SELECT id FROM expenses WHERE created_by = $1 OR deleted_by = $1 OR updated_by = $1
      UNION SELECT expense_id FROM expense_payers WHERE user_id = $1
      UNION SELECT expense_id FROM expense_splits WHERE user_id = $1
      UNION SELECT items.expense_id FROM expense_item_assignments assignments
        JOIN expense_items items ON items.id = assignments.item_id WHERE assignments.user_id = $1
      UNION SELECT expense_id FROM live_splits WHERE host_id = $1
    ) ORDER BY id COLLATE "C" FOR NO KEY UPDATE NOWAIT`, [userId], client);
  }
  return account;
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
    WHERE owned.created_by = $1 AND candidate.id <> $1 AND candidate.deleted_at IS NULL
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
export async function eraseAccountData(input: { userId: string; anonymousId: string;
  expenseDescription: string; itemName: string; groupName: string }, client: PoolClient): Promise<void> {
  const identity = [input.userId, input.anonymousId];
  // Account and actor references are authoritative. Legacy rows without an
  // actor may use a specific expense/group event with the same recipient.
  // Shared navigation paths such as /friends never identify an event.
  await execute(`DELETE FROM notifications
    WHERE user_id = $1 OR actor_id = $1 OR link = '/friends/' || $1`, [input.userId], client);
  await execute(`DELETE FROM notifications notice USING activity event
    WHERE event.link = notice.link
      AND (event.link LIKE '/expenses/%' OR event.link LIKE '/groups/%')
      AND (notice.actor_id IS NULL OR notice.actor_id = event.actor_id)
      AND event.audience @> jsonb_build_array(notice.user_id)
      AND (event.actor_id = $1 OR event.credit_user_id = $1 OR event.audience @> jsonb_build_array($1::text))`,
    [input.userId], client);
  await execute("DELETE FROM activity WHERE actor_id = $1 OR credit_user_id = $1 OR audience @> jsonb_build_array($1::text)", [input.userId], client);
  await execute("DELETE FROM comments WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1", [input.userId], client);
  await execute("DELETE FROM friend_requests WHERE requester_id = $1 OR recipient_id = $1", [input.userId], client);
  await execute("DELETE FROM invite_links WHERE inviter_id = $1", [input.userId], client);
  await execute("DELETE FROM live_split_people WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM phone_verifications WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM operations WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM apple_sign_in_challenges WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM apple_credentials WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM push_devices WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM user_sessions WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM push_preferences WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM push_kept_off WHERE user_id = $1", [input.userId], client);
  await execute("DELETE FROM payment_handles WHERE user_id = $1", [input.userId], client);
  await execute(`UPDATE expense_items SET name = $2 WHERE expense_id IN
    (SELECT id FROM expenses WHERE created_by = $1)`, [input.userId, input.itemName], client);
  await execute("UPDATE expenses SET description = $2, notes = '' WHERE created_by = $1", [input.userId, input.expenseDescription], client);
  await execute(`UPDATE settlements SET expense_description = $2 WHERE expense_id IN
    (SELECT id FROM expenses WHERE created_by = $1)`, [input.userId, input.expenseDescription], client);
  await execute("UPDATE groups SET name = $2 WHERE created_by = $1", [input.userId, input.groupName], client);
  await execute("UPDATE settlements SET note = '', method_label = '' WHERE from_user = $1 OR to_user = $1 OR recorded_by = $1", [input.userId], client);
  await execute("UPDATE expense_payers SET user_id = $2 WHERE user_id = $1", identity, client);
  await execute("UPDATE expense_splits SET user_id = $2 WHERE user_id = $1", identity, client);
  await execute("UPDATE expense_item_assignments SET user_id = $2 WHERE user_id = $1", identity, client);
  await execute("UPDATE group_members SET user_id = $2 WHERE user_id = $1", identity, client);
  await execute("UPDATE expenses SET created_by = $2 WHERE created_by = $1", identity, client);
  await execute("UPDATE expenses SET deleted_by = $2 WHERE deleted_by = $1", identity, client);
  await execute("UPDATE expenses SET updated_by = $2 WHERE updated_by = $1", identity, client);
  await execute("UPDATE live_splits SET host_id = $2 WHERE host_id = $1", identity, client);
  await execute("UPDATE settlements SET from_user = $2 WHERE from_user = $1", identity, client);
  await execute("UPDATE settlements SET to_user = $2 WHERE to_user = $1", identity, client);
  await execute("UPDATE settlements SET recorded_by = $2 WHERE recorded_by = $1", identity, client);
  await execute("UPDATE settlements SET deleted_by = $2 WHERE deleted_by = $1", identity, client);
  await execute("UPDATE groups SET created_by = $2 WHERE created_by = $1", identity, client);
  await execute("DELETE FROM users WHERE id = $1", [input.userId], client);
}
