/** Shared currency selection for new and existing expense forms. */

/**
 * Keeps an existing one-off expense in its saved currency even if the profile
 * default has changed. A selected group's currency remains authoritative.
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
  return groupCurrency || expenseCurrency || defaultCurrency || "USD";
}
