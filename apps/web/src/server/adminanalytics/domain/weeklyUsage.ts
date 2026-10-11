/** Pure assembly of the usage overview's weekly trend and per-type counts. */

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/** One metric's count for one week, as the database groups it. */
export interface WeeklyCount {
  metric: "users" | "expenses" | "payments" | "scans";
  /** The Monday the week starts on, "YYYY-MM-DD", UTC. */
  weekStart: string;
  count: number;
}

/** One week of the trend, every metric side by side. */
export interface WeekUsage {
  weekStart: string;
  newUserCount: number;
  expenseCount: number;
  paymentCount: number;
  receiptScanCount: number;
}

/**
 * The Mondays that start each of the trailing weeks, the current week last.
 *
 * Weeks are Monday to Sunday in UTC, the same boundary Postgres's
 * date_trunc('week') uses, so a count grouped in the database lands in the
 * week this function names for it.
 *
 * @param nowTime - The current time.
 * @param weeks - How many weeks to cover, the current one included.
 * @returns "YYYY-MM-DD" keys, oldest first.
 */
export function trailingWeekStarts(nowTime: Date, weeks: number): string[] {
  const startOfToday = Date.UTC(
    nowTime.getUTCFullYear(),
    nowTime.getUTCMonth(),
    nowTime.getUTCDate(),
  );
  // getUTCDay counts from Sunday; a Monday-based week is six days into it on a Sunday.
  const daysSinceMonday = (nowTime.getUTCDay() + 6) % 7;
  const currentMonday = startOfToday - daysSinceMonday * DAY_MS;
  return Array.from({ length: weeks }, (_unused, index) =>
    new Date(currentMonday - (weeks - 1 - index) * 7 * DAY_MS).toISOString().slice(0, 10),
  );
}

/**
 * Lays grouped weekly counts out as one row per week, zeros included, so a
 * quiet week shows as an empty bar rather than a missing one.
 *
 * @param weekStarts - The weeks to cover, oldest first.
 * @param counts - Counts grouped by metric and week; weeks with nothing are absent.
 * @returns One entry per week, in the order given.
 */
export function assembleWeeks(
  weekStarts: readonly string[],
  counts: readonly WeeklyCount[],
): WeekUsage[] {
  const weeks = new Map<string, WeekUsage>(
    weekStarts.map((weekStart) => [
      weekStart,
      { weekStart, newUserCount: 0, expenseCount: 0, paymentCount: 0, receiptScanCount: 0 },
    ]),
  );
  for (const entry of counts) {
    const week = weeks.get(entry.weekStart);
    // A week outside the trend cannot come back from a query bounded by its
    // first Monday; skipping one keeps a stray row out of the wrong bar.
    if (!week) continue;
    if (entry.metric === "users") week.newUserCount += entry.count;
    else if (entry.metric === "expenses") week.expenseCount += entry.count;
    else if (entry.metric === "payments") week.paymentCount += entry.count;
    else week.receiptScanCount += entry.count;
  }
  return [...weeks.values()];
}

/**
 * Turns a split type → count object into a list, most used first.
 *
 * @param bySplitType - Counts keyed by split type.
 * @returns The same counts as an ordered list, zero counts dropped.
 */
export function rankSplitTypes(
  bySplitType: Readonly<Record<string, number>>,
): { splitType: string; count: number }[] {
  return Object.entries(bySplitType)
    .filter(([, count]) => count > 0)
    .map(([splitType, count]) => ({ splitType, count }))
    .sort(
      (first, second) =>
        second.count - first.count || first.splitType.localeCompare(second.splitType),
    );
}
