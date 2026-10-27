/** Scope filter for the all-expenses page: everything, one-off only, or one group. */

import { ExpenseListPart } from "@haalkhata/protogen/expense/v1/expense_pb";
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
 * The part of the caller's own list a scope filter reads, as ListExpenses
 * takes it. The server applies it, so a narrowed list pages through every
 * expense that matches instead of hiding the loaded rows that do not.
 *
 * @param filter - Active filter: "all", "oneoff", or a group id.
 * @returns The request's `part` and `partGroupId`.
 */
export function scopeFilterRequest(filter: ExpenseScopeFilter): {
  part: ExpenseListPart;
  partGroupId: string;
} {
  if (filter === "all") return { part: ExpenseListPart.UNSPECIFIED, partGroupId: "" };
  if (filter === "oneoff") return { part: ExpenseListPart.ONE_OFF, partGroupId: "" };
  return { part: ExpenseListPart.GROUP, partGroupId: filter };
}

/**
 * What to say when the list is empty, naming whichever control is hiding the
 * rows. The search term is only reported when there is one — the lesson of
 * the group page's `No groups match “”` regression, encoded here from the
 * start rather than repeated.
 *
 * The scope is applied by the server, so an empty scope is empty. A search
 * reads only the pages loaded so far; while older ones remain it says so,
 * rather than claim no expense matches at all.
 *
 * @param query - Current search text; "" when not searching.
 * @param filter - Active scope filter.
 * @param groupName - Display name of the filtered group when `filter` is a
 *   group id; ignored otherwise.
 * @param moreToLoad - Whether older expenses remain to be loaded.
 * @returns A sentence naming what is hiding the expenses.
 */
export function noExpensesMessage(
  query: string,
  filter: ExpenseScopeFilter,
  groupName: string,
  moreToLoad = false,
): string {
  const scopePhrase =
    filter === "oneoff"
      ? "outside your groups"
      : filter !== "all"
        ? `in ${groupName || "that group"}`
        : "";
  if (query && moreToLoad) {
    return `None of the expenses loaded so far match “${query}”${scopePhrase ? ` ${scopePhrase}` : ""}. Show more to search further back.`;
  }
  if (query && scopePhrase) return `No expenses match “${query}” ${scopePhrase}.`;
  if (query) return `No expenses match “${query}”.`;
  if (scopePhrase) return `No expenses ${scopePhrase}.`;
  return "No expenses yet.";
}
