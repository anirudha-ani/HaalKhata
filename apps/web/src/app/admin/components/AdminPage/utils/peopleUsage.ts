/** Pure helpers for the admin people table: counting by split type, searching and ordering. */

import type { UserUsage } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { searchTerms, matchesTerms } from "@haalkhata/shared/search/filter";
import { ALL_SPLIT_TYPES, type PeopleSortKey, type SortDirection } from "../constants/adminPage";

/**
 * How many expenses a person added, of one split type or of any.
 *
 * @param person - One person's usage.
 * @param splitType - A split type key, or {@link ALL_SPLIT_TYPES}.
 * @returns The count.
 */
export function expenseCountOf(person: UserUsage, splitType: string): number {
  return person.expensesBySplitType.reduce(
    (total, entry) =>
      splitType === ALL_SPLIT_TYPES || entry.splitType === splitType ? total + entry.count : total,
    0,
  );
}

/**
 * Narrows the people list to names matching a search.
 *
 * @param people - Everyone the overview lists.
 * @param searchText - What was typed; empty matches everyone.
 * @returns The people whose name contains every term.
 */
export function searchPeople(people: readonly UserUsage[], searchText: string): UserUsage[] {
  const terms = searchTerms(searchText);
  return people.filter((person) => matchesTerms(terms, person.name));
}

/**
 * Orders the people list by one column. Ties keep the order the list came
 * in (newest first), so sorting by a column full of zeros does not shuffle
 * the rows.
 *
 * @param people - The people to order.
 * @param sortKey - The column to order by.
 * @param direction - Ascending or descending.
 * @param splitType - The split type the expenses column is showing.
 * @returns A new, ordered list.
 */
export function sortPeople(
  people: readonly UserUsage[],
  sortKey: PeopleSortKey,
  direction: SortDirection,
  splitType: string,
): UserUsage[] {
  /** Compares two people by the chosen column, ascending. */
  const ascending = (first: UserUsage, second: UserUsage): number => {
    if (sortKey === "name") return first.name.localeCompare(second.name);
    // "YYYY-MM-DD" orders correctly as text.
    if (sortKey === "joined") return first.joinedOn.localeCompare(second.joinedOn);
    if (sortKey === "payments") return first.paymentCount - second.paymentCount;
    if (sortKey === "scans") return first.receiptScanCount - second.receiptScanCount;
    return expenseCountOf(first, splitType) - expenseCountOf(second, splitType);
  };
  const sign = direction === "ascending" ? 1 : -1;
  // Array.prototype.sort is stable, which is what keeps ties in arrival order.
  return [...people].sort((first, second) => sign * ascending(first, second));
}

/**
 * A week's start as a short date for an axis, e.g. "Oct 5".
 *
 * Built from the parts rather than `new Date("YYYY-MM-DD")`, which is read
 * as UTC midnight and shows the previous day west of London.
 *
 * @param weekStart - The week's Monday, "YYYY-MM-DD".
 * @returns The short date, or the raw text when it is not a day.
 */
export function weekLabel(weekStart: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  if (!parts) return weekStart;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])).toLocaleDateString(
    undefined,
    { day: "numeric", month: "short" },
  );
}
