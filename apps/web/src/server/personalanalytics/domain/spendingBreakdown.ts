/** Pure regrouping of the window's finely grouped spending into each slice the dashboard shows. */

import type { CategorySpending, MonthlySpending } from "./currencyInsights";

/**
 * One cell of the window's spending: everything spent in one currency, in
 * one month, in one category, split one way, in one place.
 */
export interface BreakdownCell {
  currency: string;
  /** "YYYY-MM". */
  month: string;
  category: string;
  splitType: string;
  /** "" for expenses outside any group. */
  groupId: string;
  groupName: string;
  groupType: string;
  /** Whether the person still belongs to the group; false outside any group. */
  isMember: boolean;
  shareCents: number;
  paidCents: number;
  expenseCount: number;
}

/** How many of the window's expenses used one split type. */
export interface SplitTypeUse {
  splitType: string;
  expenseCount: number;
}

/** How many of the window's expenses happened in one place. */
export interface PlaceActivity {
  /** "" for expenses outside any group. */
  groupId: string;
  name: string;
  type: string;
  isMember: boolean;
  expenseCount: number;
}

/**
 * Adds cells together under a key of the caller's choosing.
 *
 * @param cells - The cells to regroup.
 * @param keyOf - Names the group a cell belongs to.
 * @param start - Builds a group's first entry from the first cell seen for it.
 * @param accumulate - Folds a further cell into its group's entry.
 * @returns One entry per group, in the order groups were first seen.
 */
function regroup<Entry>(
  cells: readonly BreakdownCell[],
  keyOf: (cell: BreakdownCell) => string,
  start: (cell: BreakdownCell) => Entry,
  accumulate: (entry: Entry, cell: BreakdownCell) => void,
): Entry[] {
  const groups = new Map<string, Entry>();
  for (const cell of cells) {
    const groupKey = keyOf(cell);
    const entry = groups.get(groupKey);
    if (entry) accumulate(entry, cell);
    else groups.set(groupKey, start(cell));
  }
  return [...groups.values()];
}

/**
 * The window's spending per currency per month.
 *
 * @param cells - The window's breakdown.
 * @returns One entry per currency and month that has any expense.
 */
export function monthlySpendingOf(cells: readonly BreakdownCell[]): MonthlySpending[] {
  return regroup(
    cells,
    // A currency code and a month key cannot contain a newline.
    (cell) => `${cell.currency}\n${cell.month}`,
    (cell) => ({
      currency: cell.currency,
      month: cell.month,
      shareCents: cell.shareCents,
      paidCents: cell.paidCents,
    }),
    (entry, cell) => {
      entry.shareCents += cell.shareCents;
      entry.paidCents += cell.paidCents;
    },
  );
}

/**
 * The window's spending per currency per category.
 *
 * @param cells - The window's breakdown.
 * @returns One entry per currency and category that has any expense.
 */
export function categorySpendingOf(cells: readonly BreakdownCell[]): CategorySpending[] {
  return regroup(
    cells,
    (cell) => `${cell.currency}\n${cell.category}`,
    (cell) => ({ currency: cell.currency, category: cell.category, shareCents: cell.shareCents }),
    (entry, cell) => {
      entry.shareCents += cell.shareCents;
    },
  );
}

/**
 * How the window's expenses were split, most used first.
 *
 * @param cells - The window's breakdown.
 * @returns One entry per split type in use.
 */
export function splitTypeUseOf(cells: readonly BreakdownCell[]): SplitTypeUse[] {
  return regroup(
    cells,
    (cell) => cell.splitType,
    (cell) => ({ splitType: cell.splitType, expenseCount: cell.expenseCount }),
    (entry, cell) => {
      entry.expenseCount += cell.expenseCount;
    },
  ).sort(
    (first, second) =>
      second.expenseCount - first.expenseCount || first.splitType.localeCompare(second.splitType),
  );
}

/**
 * Where the window's expenses happened: the busiest groups, with expenses
 * outside any group as one place of their own.
 *
 * Ties go to the group whose name sorts first, and the outside-groups row
 * (which has no name) sorts after any named group it ties with.
 *
 * @param cells - The window's breakdown.
 * @param limit - Most places to return.
 * @returns Places, busiest first.
 */
export function placeActivityOf(cells: readonly BreakdownCell[], limit: number): PlaceActivity[] {
  return regroup(
    cells,
    (cell) => cell.groupId,
    (cell) => ({
      groupId: cell.groupId,
      name: cell.groupName,
      type: cell.groupType,
      isMember: cell.isMember,
      expenseCount: cell.expenseCount,
    }),
    (entry, cell) => {
      entry.expenseCount += cell.expenseCount;
    },
  )
    .sort(
      (first, second) =>
        second.expenseCount - first.expenseCount ||
        Number(first.groupId === "") - Number(second.groupId === "") ||
        first.name.localeCompare(second.name) ||
        first.groupId.localeCompare(second.groupId),
    )
    .slice(0, Math.max(limit, 0));
}
