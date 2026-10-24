/** Names one bar of the trend in full, for the readout above the chart. */

import { TrendUnit } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { calendarDay } from "./calendarDay";

/**
 * A period's full name: "Week of Oct 5" or "October 2026".
 *
 * @param startOn - The period's first day, "YYYY-MM-DD".
 * @param unit - Weeks or months.
 * @returns The name, or the raw text when it is not a day.
 */
export function periodName(startOn: string, unit: TrendUnit): string {
  const localDay = calendarDay(startOn);
  if (!localDay) return startOn;
  if (unit === TrendUnit.MONTH) return localDay.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return `Week of ${localDay.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}
