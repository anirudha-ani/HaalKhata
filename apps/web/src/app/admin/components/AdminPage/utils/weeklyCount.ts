/** Reads one series' count off a week of the usage trend. */

import type { WeekUsage } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import type { TrendMetric } from "../constants/adminPage";

/**
 * Reads one series' count off a week.
 *
 * @param week - One week of usage.
 * @param metric - Which series to read.
 * @returns That series' count for the week.
 */
export function weeklyCount(week: WeekUsage, metric: TrendMetric): number {
  if (metric === "users") return week.newUserCount;
  if (metric === "payments") return week.paymentCount;
  if (metric === "scans") return week.receiptScanCount;
  return week.expenseCount;
}
