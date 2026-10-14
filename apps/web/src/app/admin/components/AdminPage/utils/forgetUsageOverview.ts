/** Drops the cached usage overview from the browser's memory. */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/**
 * Removes the usage overview from the query cache, figures and error alike.
 *
 * Called whenever the admin session is over. Two reasons, and the second is
 * a bug this prevents rather than a nicety:
 *
 * - The figures must not sit in memory behind a sign-in form.
 * - A query that failed while it still held data keeps its error until its
 *   next fetch succeeds. Left in the cache, the "session ended" error would
 *   be the first thing the dashboard reads after the operator signs in
 *   again, and it would send them straight back to the sign-in form.
 *
 * @param queryClient - The app's query client.
 */
export function forgetUsageOverview(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: queryKeys.adminUsage });
}
