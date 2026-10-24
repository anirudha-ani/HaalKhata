"use client";
/** Admin analytics API: the usage overview query. */

import { useQuery } from "@tanstack/react-query";
import { adminAnalyticsClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { isSessionEnded } from "../utils/isSessionEnded";

/**
 * Loads the usage overview.
 *
 * Not retried when the session has ended: asking again cannot change the
 * answer, and the page should offer the sign-in at once. Anything else gets
 * the one retry every query in the app gets. A refresh keeps the figures
 * already on screen until the new ones arrive, since the query key never
 * changes.
 *
 * @returns The overview query.
 */
export function useAdminAnalyticsAPI() {
  return useQuery({
    queryKey: queryKeys.adminUsage,
    queryFn: () => adminAnalyticsClient.getUsageOverview({}),
    retry: (failureCount, error) => !isSessionEnded(error) && failureCount < 1,
  });
}
