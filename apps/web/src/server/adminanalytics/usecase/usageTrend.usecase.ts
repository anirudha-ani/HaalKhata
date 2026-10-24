/** Usage trend business logic: activity per week or per month, for any window back to the start. */

import { TrendUnit } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { invalid } from "@/server/common/errors";
import { snapshot } from "@/server/common/db/db";
import { isRealCalendarDate } from "@/server/common/validation/validation";
import { TREND_PERIOD_COUNT } from "@/server/adminanalytics/adminanalytics.constants";
import {
  assemblePeriods,
  resolveEndOn,
  shiftPeriod,
  trendNavigation,
  utcDay,
  windowStarts,
  type TrendPeriodUnit,
} from "@/server/adminanalytics/domain/trendPeriods";
import { findFirstActivity, listTrendCounts } from "@/server/adminanalytics/repo/usage.repo";

/**
 * Builds one window of the usage trend.
 *
 * The caller must already have established an admin session; this function
 * makes no authorization decision of its own.
 *
 * The page names a day and the server does every piece of calendar math:
 * which periods the window holds, and the end days of the windows before
 * and after it and of the very first one. The page only ever sends back a
 * day this function gave it, so the two cannot disagree about where a week
 * or a month starts.
 *
 * @param request - The unit, and a day inside the last period ("" for today).
 * @returns The window in proto shape, with where to go from it.
 * @throws UsecaseError "invalid_argument" for a day that is not a real date.
 */
export async function getUsageTrend(request: { unit: TrendUnit; endOn: string }) {
  if (request.endOn !== "" && !isRealCalendarDate(request.endOn)) {
    invalid("end_on must be a real day, YYYY-MM-DD");
  }
  const unit: TrendPeriodUnit = request.unit === TrendUnit.MONTH ? "month" : "week";
  const generatedAt = new Date();
  const today = utcDay(generatedAt);

  return snapshot(async (client) => {
    const firstAt = await findFirstActivity(client);
    const firstDay = firstAt === null ? null : utcDay(new Date(firstAt));
    const endOn = resolveEndOn(request.endOn, today, firstDay, { unit, count: TREND_PERIOD_COUNT });
    const starts = windowStarts(endOn, unit, TREND_PERIOD_COUNT);
    const counts = await listTrendCounts(
      unit,
      {
        fromInstant: `${starts[0]}T00:00:00.000Z`,
        untilInstant: `${shiftPeriod(starts[starts.length - 1], unit, 1)}T00:00:00.000Z`,
      },
      client,
    );
    return {
      generatedAt: generatedAt.toISOString(),
      unit: unit === "month" ? TrendUnit.MONTH : TrendUnit.WEEK,
      periods: assemblePeriods(
        starts,
        unit,
        counts.map((countRow) => ({
          metric: countRow.metric,
          periodStart: countRow.period_start,
          count: countRow.count,
        })),
      ),
      ...trendNavigation(starts, unit, today, firstDay),
    };
  });
}
