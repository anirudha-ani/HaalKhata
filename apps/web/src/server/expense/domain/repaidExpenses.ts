/** Which listed expenses the viewer has paid back — pure. */

import { creditorsOnExpense, type ExpenseMoneyLike } from "@haalkhata/shared/expense/repayment";

/** The slice of a listed expense this decision reads. */
export interface ListedExpenseMoney extends ExpenseMoneyLike {
  /** Expense id, returned when the viewer has paid it back. */
  id: string;
  /** True once deleted: a deleted expense asks nothing of anyone. */
  deleted: boolean;
}

/**
 * The key a payment for an expense is totalled under: the expense and who
 * was paid, because a share owed to two payers is paid back to each.
 *
 * @param expenseId - The expense the payments were for.
 * @param creditorId - Who was paid.
 * @returns The map key.
 */
export function expensePaymentKey(expenseId: string, creditorId: string): string {
  return `${expenseId}|${creditorId}`;
}

/**
 * Picks out the expenses the viewer has paid back.
 *
 * Unlike "nothing pending" (which is about the balance an expense lives in),
 * this is about the one expense, and that is honest only because each
 * payment counted here was recorded for it by name. An expense counts when
 * the viewer owes somebody on it and the payments they recorded for it
 * cover what it leaves them owing each of those people. A payment made from
 * a group's or a person's page pays the balance down just the same but is
 * not counted here: it was not said to be for any one expense.
 *
 * @param expenses - The listed expenses with their payers and splits.
 * @param viewerId - The caller.
 * @param paidByKey - What the viewer has paid for each expense, per
 *   {@link expensePaymentKey}, in cents.
 * @returns Ids of the expenses the viewer has paid back, in list order.
 */
export function repaidExpenseIds(
  expenses: readonly ListedExpenseMoney[],
  viewerId: string,
  paidByKey: ReadonlyMap<string, number>,
): string[] {
  return expenses
    .filter((expense) => {
      if (expense.deleted) return false;
      const creditors = creditorsOnExpense(expense, viewerId);
      return (
        creditors.length > 0 &&
        creditors.every(
          (creditor) => (paidByKey.get(expensePaymentKey(expense.id, creditor.userId)) ?? 0) >= creditor.owedCents,
        )
      );
    })
    .map((expense) => expense.id);
}
