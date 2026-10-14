/** Scope filter for the all-expenses page: everything, one-off only, or one group. */

import { matchesTerms, searchTerms } from "../search/filter";

/**
 * The filter value: "all", "oneoff", or a group id. Group ids are opaque
 * strings, so the two keywords are reserved values — a group id can never
 * collide with them because ids are UUIDs.
 */
export type ExpenseScopeFilter = "all" | "oneoff" | string;

/**
 * The scopes every account has, offered as chips ahead of the group picker.
 * Groups are not in this row on purpose: a chip per group is fine for three
 * groups and a wall of chips above the list for thirty, so groups are picked
 * from a list that can scroll and be searched.
 */
export const FIXED_SCOPE_OPTIONS: { value: ExpenseScopeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "oneoff", label: "One-off" },
];

/** What the group picker's button says while no group is the filter. */
export const GROUP_SCOPE_LABEL = "Groups";

/**
 * How many groups the picker lists before it grows a search box. Up to here
 * the whole list is visible at a glance and a search field is only noise.
 */
export const SCOPE_PICKER_SEARCH_THRESHOLD = 8;

/**
 * Whether a scope filter names a group, as opposed to one of the two fixed
 * scopes.
 *
 * @param filter - The active filter.
 * @returns True when the filter is a group id.
 */
export function isGroupScope(filter: ExpenseScopeFilter): boolean {
  return filter !== "all" && filter !== "oneoff";
}

/**
 * The groups the picker lists for a search, matched on name the way the
 * page's own search matches it. An empty search lists every group, in the
 * order given.
 *
 * @param groups - The user's groups.
 * @param query - The picker's search text.
 * @returns The groups to list.
 */
export function scopePickerGroups<Group extends { name: string }>(
  groups: Group[],
  query: string,
): Group[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return groups;
  return groups.filter((group) => matchesTerms(terms, group.name));
}

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
