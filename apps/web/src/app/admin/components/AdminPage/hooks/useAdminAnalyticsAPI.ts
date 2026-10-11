"use client";
/** Admin analytics API: the usage overview query and the sign-out mutation. */

import { Code, ConnectError } from "@connectrpc/connect";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminAnalyticsClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Whether an error means the admin session is gone: expired, signed out
 * elsewhere, or its address removed from the allowlist.
 *
 * @param error - The value a query or mutation failed with.
 * @returns True when the fix is to sign in again.
 */
export function isSessionEnded(error: unknown): boolean {
  return error instanceof ConnectError && error.code === Code.Unauthenticated;
}

/**
 * Loads the usage overview and exposes sign-out.
 *
 * Not retried when the session has ended: asking again cannot change the
 * answer, and the page should offer the sign-in at once. Anything else gets
 * the one retry every query in the app gets. The previous overview stays on
 * screen during a refresh, so the page dims and updates rather than
 * collapsing to a spinner.
 *
 * Signing out clears the cached overview whether or not the server answered:
 * usage figures must not sit in memory behind a sign-in form.
 *
 * @param options - Hook options.
 * @param options.onSignedOut - Called once the session is over on this browser.
 * @returns The overview `query` and the `signOut` mutation.
 */
export function useAdminAnalyticsAPI({ onSignedOut }: { onSignedOut: () => void }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.adminUsage,
    queryFn: () => adminAnalyticsClient.getUsageOverview({}),
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => !isSessionEnded(error) && failureCount < 1,
  });

  const signOut = useMutation({
    mutationFn: () => adminAnalyticsClient.signOut({}),
    onSettled: () => {
      queryClient.removeQueries({ queryKey: queryKeys.adminUsage });
    },
    onSuccess: onSignedOut,
  });

  return { query, signOut };
}
