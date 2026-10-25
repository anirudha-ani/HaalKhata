/** Labels one bar of the trend on the chart's axis. */

import { TrendUnit } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { calendarDay } from "@haalkhata/shared/analytics/insights";

/**
 * A period's start as a short axis label: "Oct 5" for a week, "Oct" for a
 * month, and "Jan 2026" for a January, so the turn of a year is marked.
 *
 * @param startOn - The period's first day, "YYYY-MM-DD".
 * @param unit - Weeks or months.
 * @returns The label, or the raw text when it is not a day.
 */
export function periodAxisLabel(startOn: string, unit: TrendUnit): string {
  const localDay = calendarDay(startOn);
  if (!localDay) return startOn;
  if (unit !== TrendUnit.MONTH) return localDay.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return localDay.toLocaleDateString(
    undefined,
    localDay.getMonth() === 0 ? { month: "short", year: "numeric" } : { month: "short" },
  );
}
