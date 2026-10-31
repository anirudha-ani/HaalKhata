/** Shared currency selection for new and existing expense forms. */

/**
 * The currency an expense form works in. An expense being edited keeps the
 * currency it was saved in, whatever the profile default or its group's
 * currency now say — the server refuses an edit naming another. A new
 * expense takes its group's currency, or the account's default outside a
 * group.
 * @param groupCurrency - Currency of the currently selected group, when any.
 * @param expenseCurrency - Saved currency when editing an existing expense.
 * @param defaultCurrency - Account default used only for a new one-off expense.
 * @returns The currency used by every input, preview and submitted amount.
 */
export function expenseFormCurrency(
  groupCurrency: string | undefined,
  expenseCurrency: string | undefined,
  defaultCurrency: string | undefined,
): string {
  return expenseCurrency || groupCurrency || defaultCurrency || "USD";
}
