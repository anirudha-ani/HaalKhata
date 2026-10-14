/** Formats a week's start for the trend chart's axis. */

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
