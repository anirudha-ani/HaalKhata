"use client";
/** Usage trend API: one window of activity per week or per month. */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { TrendUnit } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { adminAnalyticsClient } from "@/lib/api/adminConnect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { isSessionEnded } from "../utils/isSessionEnded";

/**
 * Loads one window of the trend. The window on screen stays there, dimmed,
 * while the next one loads, so paging through time swaps the bars instead
 * of collapsing the card to a spinner and back.
 *
 * @param unit - Weeks or months.
 * @param endOn - A day the server handed out, inside the last period; "" for today.
 * @returns The trend query.
 */
export function useUsageTrendAPI(unit: TrendUnit, endOn: string) {
  return useQuery({
    queryKey: queryKeys.adminTrend(unit, endOn),
    queryFn: () => adminAnalyticsClient.getUsageTrend({ unit, endOn }),
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => !isSessionEnded(error) && failureCount < 1,
    // Each read aggregates across the whole product and spends the admin
    // read budget; coming back to the tab is not a reason to redo it. The
    // dashboard's Refresh button is.
    refetchOnWindowFocus: false,
  });
}
