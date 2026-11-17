/** Access to an expense as it exists in the caller’s snapshot. */
import type { PoolClient } from "pg";
import { isMember } from "@/server/group/repo/groups.repo";
import { loadExpenseChildren, type ExpenseChildren, type ExpenseRow } from "../repo/expenses.repo";
import { isInLiveSplit } from "../repo/liveSplits.repo";

/**
 * @param userId - Authenticated viewer.
 * @param expense - Expense row under consideration.
 * @param client - Connection that read the expense, when inside a snapshot or write.
 * @param loaded - Previously loaded children from that same connection.
 * @returns Whether the viewer can read this version of the expense.
 */
export async function canReadExpense(userId: string, expense: ExpenseRow, client?: PoolClient, loaded?: ExpenseChildren) {
  if (expense.group_id) return isMember(expense.group_id, userId, client);
  if (expense.created_by === userId) return true;
  const children = loaded ?? await loadExpenseChildren([expense.id], client, false);
  return (children.payers.get(expense.id) ?? []).some((payer) => payer.user_id === userId) ||
    (children.splits.get(expense.id) ?? []).some((split) => split.user_id === userId) ||
    await isInLiveSplit(expense.id, userId, client);
}
