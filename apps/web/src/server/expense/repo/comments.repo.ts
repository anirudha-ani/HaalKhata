/** All SQL for the comments table. */

import type { PoolClient } from "pg";
import { newId, query } from "@/server/common/db";

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
 * Lists an expense's comments, oldest first.
 *
 * @param expenseId - Id of the expense whose comments to list.
 * @returns Comment rows in chronological order.
 */
export async function listCommentsByExpense(expenseId: string): Promise<CommentRow[]> {
  return query<CommentRow>(
    `SELECT * FROM comments WHERE expense_id = $1 ORDER BY created_at ASC`,
    [expenseId],
  );
}
