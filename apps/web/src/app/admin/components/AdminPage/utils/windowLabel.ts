/** Names the stretch of time the trend is showing. */

import { TrendUnit, type TrendPeriod } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { calendarDay } from "./calendarDay";

/**
 * The window as a range: "Aug 3 to Oct 25, 2026" in weeks (the first year
 * written too when the range crosses one), "Nov 2025 to Oct 2026" in months.
 *
 * @param periods - The window's periods, oldest first.
 * @param unit - Weeks or months.
 * @returns The range, or "" when there are no periods or their days are not days.
 */
export function windowLabel(
  periods: readonly Pick<TrendPeriod, "startOn" | "endOn">[],
  unit: TrendUnit,
): string {
  if (periods.length === 0) return "";
  const first = calendarDay(periods[0].startOn);
  const lastStart = calendarDay(periods[periods.length - 1].startOn);
  const lastEnd = calendarDay(periods[periods.length - 1].endOn);
  if (!first || !lastStart || !lastEnd) return "";
  if (unit === TrendUnit.MONTH) {
    const monthYear = { month: "short", year: "numeric" } as const;
    return `${first.toLocaleDateString(undefined, monthYear)} to ${lastStart.toLocaleDateString(undefined, monthYear)}`;
  }
  const sameYear = first.getFullYear() === lastEnd.getFullYear();
  const from = first.toLocaleDateString(
    undefined,
    sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" },
  );
  return `${from} to ${lastEnd.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}
