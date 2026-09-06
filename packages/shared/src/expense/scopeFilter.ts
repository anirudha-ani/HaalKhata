/** Scope filter for the all-expenses page: everything, one-off only, or one group. */

/**
 * The filter value: "all", "oneoff", or a group id. Group ids are opaque
 * strings, so the two keywords are reserved values — a group id can never
 * collide with them because ids are UUIDs.
 */
export type ExpenseScopeFilter = "all" | "oneoff" | string;

/**
 * Whether an expense belongs under the given scope filter.
 *
 * @param groupId - The expense's group id; "" for a one-off expense.
 * @param filter - Active filter: "all", "oneoff", or a specific group id.
 * @returns True when the expense should be listed.
 */
export function matchesScopeFilter(groupId: string, filter: ExpenseScopeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "oneoff") return groupId === "";
  return groupId === filter;
}

/**
 * What to say when the list is empty, naming whichever control is hiding the
 * rows. The search term is only reported when there is one — the lesson of
 * the group page's `No groups match “”` regression, encoded here from the
 * start rather than repeated.
 *
 * @param query - Current search text; "" when not searching.
 * @param filter - Active scope filter.
 * @param groupName - Display name of the filtered group when `filter` is a
 *   group id; ignored otherwise.
 * @returns A sentence naming what is hiding the expenses.
 */
export function noExpensesMessage(
  query: string,
  filter: ExpenseScopeFilter,
  groupName: string,
): string {
  const scopePhrase =
    filter === "oneoff"
      ? "outside your groups"
      : filter !== "all"
        ? `in ${groupName || "that group"}`
        : "";
  if (query && scopePhrase) return `No expenses match “${query}” ${scopePhrase}.`;
  if (query) return `No expenses match “${query}”.`;
  if (scopePhrase) return `No expenses ${scopePhrase}.`;
  return "No expenses yet.";
}
