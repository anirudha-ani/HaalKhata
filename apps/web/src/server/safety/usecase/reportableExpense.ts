/** Minimal expense content for safety reports, authorized in one snapshot. */
import { snapshot } from "@/server/common/db/db";
import { denied, notFound } from "@/server/common/errors";
import { findExpenseById, loadExpenseChildren } from "@/server/expense/repo/expenses.repo";
import { canReadExpense } from "@/server/expense/usecase/expenseAccess";

/**
 * Checks visibility and reads only the content a report needs.
 * @param viewerId - Signed-in reporter.
 * @param expenseId - Bill owning the reported content.
 * @param includeItems - Whether the report concerns the bill itself.
 * @returns The saved author and original bill text, never comments or activity.
 */
export async function reportableExpense(viewerId: string, expenseId: string, includeItems = false) {
  return snapshot(async (client) => {
    const expense = await findExpenseById(expenseId, client);
    if (!expense) notFound("expense not found");
    const children = includeItems ? await loadExpenseChildren([expenseId], client) : undefined;
    if (!await canReadExpense(viewerId, expense, client, children)) denied("you cannot access this expense");
    return {
      author_id: expense.created_by,
      snapshot: { description: expense.description, notes: expense.notes, items: (children?.items.get(expenseId) ?? []).map((item) => item.name) },
    };
  });
}
