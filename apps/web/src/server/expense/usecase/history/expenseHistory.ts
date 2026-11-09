/** Bounded, authorized expense edit history, without reconstructing money positions. */
import type { PoolClient } from "pg";
import { EXPENSE_HISTORY_PAGE_SIZE } from "@haalkhata/shared/api/paging";
import { snapshot } from "@/server/common/db/db";
import { denied, invalid, notFound } from "@/server/common/errors";
import { decodeCursor, encodeCursor, isCursorValue, isExactTimestamp } from "@/server/common/pagination/pagination";
import { findUsersByIds } from "@/server/auth/repo/users.repo";
import { toPublicUser } from "@/server/auth/usecase/identity/user.mapper";
import { listActivityForExpense } from "@/server/social/repo/activity.repo";
import { findExpenseById } from "@/server/expense/repo/expenses.repo";
import { canReadExpense } from "../expenseAccess";

/**
 * Reads a bounded history page in display order after access was established.
 * @param expenseId - Authorized bill.
 * @param cursor - Previous page's boundary, bound to this bill.
 * @param client - Optional permission-check snapshot.
 * @returns Newest or older events in chronological order and a continuation.
 */
export async function readExpenseHistory(expenseId: string, cursor = "", client?: PoolClient) {
  const parts = cursor ? decodeCursor(cursor, 3) : null;
  if (cursor && (!parts || parts[0] !== expenseId || !isExactTimestamp(parts[1]) || !isCursorValue(parts[2]))) invalid("invalid history cursor");
  const before = parts ? { at: parts[1], id: parts[2] } : null;
  const rows = await listActivityForExpense(expenseId, before, EXPENSE_HISTORY_PAGE_SIZE + 1, client);
  const page = rows.slice(0, EXPENSE_HISTORY_PAGE_SIZE);
  const oldest = page.at(-1);
  const people = new Map((await findUsersByIds([...new Set(page.map((event) => event.actor_id))], client)).map((person) => [person.id, toPublicUser(person)]));
  return {
    history: page.reverse().map((event) => ({ id: event.id, actor: people.get(event.actor_id), type: event.type, createdAt: event.created_at })),
    nextCursor: rows.length > page.length && oldest ? encodeCursor([expenseId, oldest.created_at_exact, oldest.id]) : "",
  };
}

/**
 * Authorizes each older-page request against the same snapshot it reads.
 * @param viewerId - Signed-in reader.
 * @param expenseId - Requested bill.
 * @param cursor - Previous page's boundary.
 * @returns A bounded authorized history page.
 */
export async function listExpenseHistory(viewerId: string, expenseId: string, cursor: string) {
  return snapshot(async (client) => {
    const expense = await findExpenseById(expenseId, client);
    if (!expense) notFound("expense not found");
    if (!await canReadExpense(viewerId, expense, client)) denied("you cannot access this expense");
    return readExpenseHistory(expenseId, cursor, client);
  });
}
