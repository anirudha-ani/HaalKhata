/**
 * All SQL for the admin page's moderation queue and its four actions.
 *
 * The reads select what the operator decides on and nothing more: the
 * reported words, pulled out of the server-made snapshot field by field (so
 * the expense id a comment's snapshot carries never leaves the database),
 * the author's display name through the admin surface's withholding rule,
 * counts, and instants. No statement selects a reporter, an email, a phone,
 * an avatar, an amount or any id other than a report's own.
 *
 * The writes are the statements of safety/repo/moderation.sql, the SQL
 * ops/moderate.sh runs, with parameters in place of psql variables. The
 * moderation integration test runs both on the same data and compares what
 * they leave behind, so a change to one that the other does not make fails.
 */

import type { PoolClient } from "pg";
import { execute, query, queryOne } from "@/server/common/db/db";
import { DISPLAY_NAME } from "@/server/adminanalytics/repo/displayName";

/** One piece of reported content and the open reports about it. */
export interface ReportedContentRow {
  report_id: string;
  target_kind: string;
  report_count: number;
  /** One entry per open report, so a reason given twice appears twice. */
  reasons: string[];
  /** RFC 3339; the pool turns every timestamptz into one (common/db/db.ts). */
  first_reported_at: string;
  last_reported_at: string;
  text: string | null;
  notes: string | null;
  item_names: string[] | null;
  /** Null only if the author's row is gone, which a cascade normally prevents. */
  author_name: string | null;
  author_suspended: boolean;
  author_active: boolean;
  author_open_report_count: number;
  /** Pieces of content waiting in all, before the limit. */
  total_count: number;
}

/**
 * Reads the queue: open reports grouped by the content they are about,
 * longest waiting first.
 *
 * Each group shows its newest report's snapshot and takes its newest
 * report's id as the handle, so what the operator reads is the latest copy
 * anyone reported. The snapshot is taken apart here, by kind, and only the
 * words leave the database.
 *
 * @param limit - Most groups to return.
 * @param client - The snapshot's client.
 * @returns The groups, oldest first report first; every row carries the
 *   total so the caller can tell whether the list was cut short.
 */
export async function listReportedContent(
  limit: number,
  client: PoolClient,
): Promise<ReportedContentRow[]> {
  return query<ReportedContentRow>(
    `WITH grouped AS (
       SELECT rep.target_kind,
              rep.target_id,
              (array_agg(rep.id ORDER BY rep.created_at DESC, rep.id DESC))[1] AS report_id,
              (array_agg(rep.snapshot ORDER BY rep.created_at DESC, rep.id DESC))[1] AS snapshot,
              (array_agg(rep.reported_user_id ORDER BY rep.created_at DESC, rep.id DESC))[1] AS author_id,
              array_agg(rep.reason) AS reasons,
              COUNT(*)::int AS report_count,
              MIN(rep.created_at) AS first_reported_at,
              MAX(rep.created_at) AS last_reported_at
         FROM content_reports rep
        WHERE rep.status = 'open'
        GROUP BY rep.target_kind, rep.target_id
     )
     SELECT grp.report_id,
            grp.target_kind,
            grp.report_count,
            grp.reasons,
            grp.first_reported_at,
            grp.last_reported_at,
            CASE grp.target_kind
              WHEN 'comment' THEN grp.snapshot->>'body'
              WHEN 'expense' THEN grp.snapshot->>'description'
              ELSE grp.snapshot->>'name'
            END AS text,
            CASE WHEN grp.target_kind = 'expense' THEN grp.snapshot->>'notes' END AS notes,
            CASE WHEN grp.target_kind = 'expense' AND jsonb_typeof(grp.snapshot->'items') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(grp.snapshot->'items'))
            END AS item_names,
            ${DISPLAY_NAME} AS author_name,
            COALESCE(usr.suspended_at IS NOT NULL, false) AS author_suspended,
            COALESCE(usr.merged_into IS NULL AND usr.deleted_at IS NULL, false) AS author_active,
            CASE WHEN grp.author_id IS NULL THEN 1
              ELSE (COUNT(*) OVER (PARTITION BY grp.author_id))::int
            END AS author_open_report_count,
            (COUNT(*) OVER ())::int AS total_count
       FROM grouped grp
       LEFT JOIN users usr ON usr.id = grp.author_id
      ORDER BY grp.first_reported_at, grp.report_id
      LIMIT $1`,
    [limit],
    client,
  );
}

/** A suspended account, named and dated. */
export interface SuspendedAccountRow {
  name: string;
  /** RFC 3339. */
  suspended_at: string;
  /** The newest report about them; null when none is left. */
  report_id: string | null;
}

/**
 * Lists the accounts suspended right now, each with the newest report about
 * them, open or closed, to resume through.
 *
 * @param limit - Most accounts to return.
 * @param client - The snapshot's client.
 * @returns Accounts, most recently suspended first.
 */
export async function listSuspendedAccounts(
  limit: number,
  client: PoolClient,
): Promise<SuspendedAccountRow[]> {
  return query<SuspendedAccountRow>(
    `SELECT ${DISPLAY_NAME} AS name,
            usr.suspended_at,
            (SELECT rep.id FROM content_reports rep
              WHERE rep.reported_user_id = usr.id
              ORDER BY rep.created_at DESC, rep.id DESC
              LIMIT 1) AS report_id
       FROM users usr
      WHERE usr.suspended_at IS NOT NULL
      ORDER BY usr.suspended_at DESC, usr.id
      LIMIT $1`,
    [limit],
    client,
  );
}

/** What an action needs to know about the report it was given. */
export interface LockedReportRow {
  target_kind: string;
  target_id: string;
  reported_user_id: string | null;
  status: string;
}

/**
 * Reads a report and locks it for the rest of the transaction, so two
 * actions on the same report (a double click, two tabs) run one after the
 * other and the second sees what the first did.
 *
 * @param reportId - The report the operator acted through.
 * @param client - The action's transaction.
 * @returns The report, or undefined when there is no such report.
 */
export async function lockReport(
  reportId: string,
  client: PoolClient,
): Promise<LockedReportRow | undefined> {
  return queryOne<LockedReportRow>(
    `SELECT target_kind, target_id, reported_user_id, status
       FROM content_reports
      WHERE id = $1
      FOR UPDATE`,
    [reportId],
    client,
  );
}

/** Whether an account can be suspended or resumed, and whether it is now. */
export interface AccountStandingRow {
  suspended: boolean;
  /** False for a merge tombstone or the stand-in a deleted account leaves. */
  active: boolean;
}

/**
 * Reads an account's standing, locking the row so a suspension and a
 * resumption cannot interleave.
 *
 * @param userId - The reported account.
 * @param client - The action's transaction.
 * @returns The standing, or undefined when the account is gone.
 */
export async function lockAccountStanding(
  userId: string,
  client: PoolClient,
): Promise<AccountStandingRow | undefined> {
  return queryOne<AccountStandingRow>(
    `SELECT suspended_at IS NOT NULL AS suspended,
            (merged_into IS NULL AND deleted_at IS NULL) AS active
       FROM users
      WHERE id = $1
      FOR UPDATE`,
    [userId],
    client,
  );
}

/**
 * Closes every open report about one piece of content.
 *
 * @param target - The content's kind and id, from the locked report.
 * @param status - "dismissed" when the content stays, "removed" when it went.
 * @param client - The action's transaction.
 * @returns How many reports were closed.
 */
export async function closeReportsAbout(
  target: { kind: string; id: string },
  status: "dismissed" | "removed",
  client: PoolClient,
): Promise<number> {
  const closed = await query<{ id: string }>(
    `UPDATE content_reports
        SET status = $3, resolved_at = now()
      WHERE target_kind = $1 AND target_id = $2 AND status = 'open'
      RETURNING id`,
    [target.kind, target.id, status],
    client,
  );
  return closed.length;
}

/**
 * Deletes a reported comment.
 *
 * @param commentId - The comment.
 * @param client - The action's transaction.
 */
export async function deleteComment(commentId: string, client: PoolClient): Promise<void> {
  await execute("DELETE FROM comments WHERE id = $1", [commentId], client);
}

/**
 * Replaces an expense's words: its description, its notes and every item
 * name. Amounts, payers and splits are not touched.
 *
 * @param expenseId - The expense.
 * @param replacement - The description and item name to write.
 * @param client - The action's transaction.
 */
export async function blankExpenseText(
  expenseId: string,
  replacement: { description: string; itemName: string },
  client: PoolClient,
): Promise<void> {
  await execute(
    "UPDATE expenses SET description = $2, notes = '' WHERE id = $1",
    [expenseId, replacement.description],
    client,
  );
  await execute(
    "UPDATE expense_items SET name = $2 WHERE expense_id = $1",
    [expenseId, replacement.itemName],
    client,
  );
}

/**
 * Replaces a group's name.
 *
 * @param groupId - The group.
 * @param name - The name to write.
 * @param client - The action's transaction.
 */
export async function renameGroup(groupId: string, name: string, client: PoolClient): Promise<void> {
  await execute("UPDATE groups SET name = $2 WHERE id = $1", [groupId, name], client);
}

/**
 * Resets a person's profile: their display name, their profile picture, and
 * the legacy payment handles moderation.sql also clears.
 *
 * @param userId - The person.
 * @param name - The name to write.
 * @param client - The action's transaction.
 */
export async function resetProfile(userId: string, name: string, client: PoolClient): Promise<void> {
  await execute("UPDATE users SET name = $2, avatar_url = NULL WHERE id = $1", [userId, name], client);
  await execute("DELETE FROM payment_handles WHERE user_id = $1", [userId], client);
}

/**
 * Replaces the feed lines and notifications that may quote removed content:
 * everything the author did, and everything that links to the content.
 * Queued pushes read their words from these notification rows, so a push
 * not yet sent goes out with the replacement.
 *
 * @param scope - The author (null when unknown) and the content's id.
 * @param quotation - The words to write instead.
 * @param client - The action's transaction.
 */
export async function replaceQuotations(
  scope: { authorId: string | null; targetId: string },
  quotation: string,
  client: PoolClient,
): Promise<void> {
  await execute(
    `UPDATE activity SET message = $3
      WHERE actor_id = $1::text OR group_id = $2::text OR link = '/expenses/' || $2::text`,
    [scope.authorId, scope.targetId, quotation],
    client,
  );
  await execute(
    `UPDATE notifications SET title = $3, body = ''
      WHERE actor_id = $1::text
         OR link IN ('/expenses/' || $2::text, '/groups/' || $2::text)`,
    [scope.authorId, scope.targetId, quotation],
    client,
  );
}

/**
 * Suspends an account and ends every session it holds: the token version
 * moves on, so every token minted before now stops working.
 *
 * @param userId - The account.
 * @param client - The action's transaction.
 */
export async function suspendAccount(userId: string, client: PoolClient): Promise<void> {
  await execute(
    "UPDATE users SET suspended_at = now(), token_version = token_version + 1 WHERE id = $1",
    [userId],
    client,
  );
}

/**
 * Lifts a suspension. The token version moves on again, as moderation.sql
 * does, so nothing minted while suspended survives it.
 *
 * @param userId - The account.
 * @param client - The action's transaction.
 */
export async function resumeAccount(userId: string, client: PoolClient): Promise<void> {
  await execute(
    "UPDATE users SET suspended_at = NULL, token_version = token_version + 1 WHERE id = $1",
    [userId],
    client,
  );
}
