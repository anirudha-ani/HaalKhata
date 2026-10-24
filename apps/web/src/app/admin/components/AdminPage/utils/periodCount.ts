/** Reads one series' count off a period of the usage trend. */

import type { TrendPeriod } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import type { TrendMetric } from "../constants/adminPage";

/**
 * Reads one series' count off a period.
 *
 * @param period - One week or month of usage.
 * @param metric - Which series to read.
 * @returns That series' count for the period.
 */
export function periodCount(period: TrendPeriod, metric: TrendMetric): number {
  if (metric === "users") return period.newUserCount;
  if (metric === "payments") return period.paymentCount;
  if (metric === "scans") return period.receiptScanCount;
  return period.expenseCount;
}
