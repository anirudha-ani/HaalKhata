/** Account-bound TanStack Query cache persistence and reset helpers. */

import type { QueryClient } from "@tanstack/react-query";

/** localStorage key used by the app-wide query-cache persister. */
export const QUERY_CACHE_STORAGE_KEY = "haalkhata-query-cache";

/**
 * Clears all in-memory and persisted data before a newly authenticated account
 * enters the app, preventing the prior account's ledger from rendering.
 *
 * @param queryClient - App-wide TanStack Query client.
 */
export function clearAccountQueryCache(queryClient: QueryClient): void {
  queryClient.clear();
  window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
}
