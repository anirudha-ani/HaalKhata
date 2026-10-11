"use client";
/** Admin analytics API: the usage overview query and the sign-out mutation. */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminAnalyticsClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { forgetUsageOverview } from "../utils/forgetUsageOverview";
import { isSessionEnded } from "../utils/isSessionEnded";

/**
 * Loads the usage overview and exposes sign-out.
 *
 * Not retried when the session has ended: asking again cannot change the
 * answer, and the page should offer the sign-in at once. Anything else gets
 * the one retry every query in the app gets. A refresh keeps the figures
 * already on screen until the new ones arrive, since the query key never
 * changes.
 *
 * Signing out forgets the cached overview once the server confirms the
 * session is gone. When the server could not end it, nothing is forgotten
 * and nothing changes: the operator is still signed in, is told so, and can
 * try again.
 *
 * @param options - Hook options.
 * @param options.onSignedOut - Called once the server has ended the session.
 * @returns The overview `query`, the `signOut` mutation, and `forgetOverview`
 *   for the caller to use when the server reports the session has ended.
 */
export function useAdminAnalyticsAPI({ onSignedOut }: { onSignedOut: () => void }) {
  const queryClient = useQueryClient();
  const forgetOverview = useCallback(() => forgetUsageOverview(queryClient), [queryClient]);

  const query = useQuery({
    queryKey: queryKeys.adminUsage,
    queryFn: () => adminAnalyticsClient.getUsageOverview({}),
    retry: (failureCount, error) => !isSessionEnded(error) && failureCount < 1,
  });

  const signOut = useMutation({
    mutationFn: () => adminAnalyticsClient.signOut({}),
    onSuccess: () => {
      forgetOverview();
      onSignedOut();
    },
  });

  return { query, signOut, forgetOverview };
}
