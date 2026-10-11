"use client";
/** Insights API: the one query behind the insights dashboard. */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { personalAnalyticsClient } from "@/lib/api/connect";
import { currentLocalMonth } from "@haalkhata/shared/analytics/insights";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Loads the signed-in person's insights for one window size.
 *
 * The previous window's data stays on screen while a new one loads, so
 * changing the period dims the charts and swaps them rather than collapsing
 * the page to a spinner and jumping back.
 *
 * @param months - How many calendar months the window covers.
 * @returns The TanStack query for that window.
 */
export function useInsightsAPI(months: number) {
  return useQuery({
    queryKey: queryKeys.insights(months),
    // The server only knows UTC; the client says which month is on its wall.
    queryFn: () =>
      personalAnalyticsClient.getInsights({ months, localMonth: currentLocalMonth() }),
    placeholderData: keepPreviousData,
  });
}
