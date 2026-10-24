/** Orders the admin people list by one column. */

import type { UserUsage } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import type { PeopleSortKey, SortDirection } from "../constants/adminPage";
import { expenseCountOf } from "./expenseCountOf";

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
