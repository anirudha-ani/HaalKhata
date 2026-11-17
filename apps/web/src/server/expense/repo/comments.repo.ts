/** All SQL for the comments table. */

import type { PoolClient } from "pg";
import { newId, query, queryOne } from "@/server/common/db/db";
import { exactTimeSql } from "@/server/common/pagination/pagination";
import { COMMENT_SCAN_MULTIPLIER } from "../expense.constants";

/** One row of the comments table (column names mirror SQL). */
export interface CommentRow {
  id: string;
  expense_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

/**
 * Inserts a comment on an expense.
 *
 * @param expenseId - Id of the expense being commented on.
 * @param userId - Id of the comment's author.
 * @param body - Comment text (already trimmed/validated by the usecase).
 * @param client - Transaction client when the comment must commit with the
 *   feed event and notifications that announce it.
 * @returns The inserted row, including its generated id and timestamp.
 */
export async function insertComment(
  expenseId: string,
  userId: string,
  body: string,
  client?: PoolClient,
): Promise<CommentRow> {
  const rows = await query<CommentRow>(
    `INSERT INTO comments (id, expense_id, user_id, body) VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [newId(), expenseId, userId, body],
    client,
  );
  return rows[0];
}

/**
 * Finds one comment, for answering a retry of the request that stored it.
 *
 * @param commentId - Id of the comment.
 * @param client - The retry's transaction.
 * @returns The row, or undefined.
 */
export async function findCommentById(commentId: string, client: PoolClient): Promise<CommentRow | undefined> {
  return queryOne<CommentRow>(`SELECT * FROM comments WHERE id = $1`, [commentId], client);
}

/**
 * Lists every one of an expense's comments, oldest first: what app versions
 * from before paging read. Paging reads {@link listCommentPage}.
 *
 * @param expenseId - Id of the expense whose comments to list.
 * @param viewerId - The reader; comments across a block either way are left out.
 * @returns Comment rows in chronological order.
 */
export async function listCommentsByExpense(expenseId: string, viewerId?: string): Promise<CommentRow[]> {
  return query<CommentRow>(
    `SELECT * FROM comments WHERE expense_id = $1 AND ($2::text IS NULL OR NOT EXISTS (
      SELECT 1 FROM user_blocks WHERE (blocker_id = $2 AND blocked_id = comments.user_id)
        OR (blocker_id = comments.user_id AND blocked_id = $2))) ORDER BY created_at ASC, id ASC`,
    [expenseId, viewerId ?? null],
  );
}

/**
 * Where a comment sits in its thread: when it was written (to the
 * microsecond), then its id, so no two share a place.
 */
export interface CommentKey {
  /** When it was written, from {@link exactTimeSql}. */
  createdAt: string;
  /** Its id, settling comments written in the same microsecond. */
  id: string;
}

/** A comment row with its creation time to the microsecond, for its cursor. */
export type PagedCommentRow = CommentRow & { created_at_exact: string };

/**
 * One page of an expense's comments, going back in time: the newest first,
 * starting just before `before`. Comments across a block either way are
 * left out, as in {@link listCommentsByExpense}. A bounded raw window serves
 * ordinary pages. If too few comments are visible, index seeks enumerate
 * distinct historical authors and read one bounded page per visible author.
 * This scales with authors rather than an arbitrarily long blocked thread;
 * authors who left a group remain discoverable from the comments themselves.
 *
 * @param expenseId - Id of the expense whose comments to list.
 * @param viewerId - The reader.
 * @param before - The oldest comment already shown; null starts at the newest.
 * @param limit - Most rows to return.
 * @param client - Snapshot client; omitted, the pool.
 * @returns The rows, newest first, each with its exact creation time.
 */
export async function listCommentPage(
  expenseId: string,
  viewerId: string,
  before: CommentKey | null,
  limit: number,
  client?: PoolClient,
): Promise<PagedCommentRow[]> {
  return query<PagedCommentRow>(
    `WITH RECURSIVE recent AS MATERIALIZED (
       SELECT comments.* FROM comments WHERE expense_id = $1
         AND ($3::timestamptz IS NULL OR (created_at, id) < ($3::timestamptz, $4))
       ORDER BY created_at DESC, id DESC LIMIT $6
     ), visible_recent AS MATERIALIZED (
       SELECT * FROM recent WHERE NOT EXISTS (SELECT 1 FROM user_blocks
         WHERE (blocker_id = $2 AND blocked_id = recent.user_id)
            OR (blocker_id = recent.user_id AND blocked_id = $2))
     ), fallback AS (
       SELECT (SELECT count(*) FROM recent) = $6
          AND (SELECT count(*) FROM visible_recent) < $5 AS needed
     ), authors AS (
       (SELECT user_id FROM comments WHERE expense_id = $1 AND (SELECT needed FROM fallback)
          ORDER BY user_id LIMIT 1)
       UNION ALL
       SELECT following.user_id FROM authors CROSS JOIN LATERAL (
         SELECT user_id FROM comments WHERE expense_id = $1 AND user_id > authors.user_id
           ORDER BY user_id LIMIT 1
       ) following
     ), visible_authors AS (
       SELECT user_id FROM authors WHERE NOT EXISTS (SELECT 1 FROM user_blocks
         WHERE (blocker_id = $2 AND blocked_id = authors.user_id)
            OR (blocker_id = authors.user_id AND blocked_id = $2))
     ), candidates AS (
       SELECT * FROM visible_recent WHERE NOT (SELECT needed FROM fallback)
       UNION ALL
       SELECT older.* FROM visible_authors CROSS JOIN LATERAL (
         SELECT comments.* FROM comments WHERE expense_id = $1 AND user_id = visible_authors.user_id
           AND ($3::timestamptz IS NULL OR (created_at, id) < ($3::timestamptz, $4))
         ORDER BY created_at DESC, id DESC LIMIT $5
       ) older
     ) SELECT *, ${exactTimeSql("created_at")} AS created_at_exact FROM candidates
       ORDER BY created_at DESC, id DESC LIMIT $5`,
    [expenseId, viewerId, before?.createdAt ?? null, before?.id ?? null, limit, limit * COMMENT_SCAN_MULTIPLIER],
    client,
  );
}
