/** Account-bound TanStack Query cache reset and legacy-storage cleanup. */

import type { QueryClient } from "@tanstack/react-query";

/** Former localStorage key, retained only so upgrades erase historical PII. */
export const LEGACY_QUERY_CACHE_STORAGE_KEY = "haalkhata-query-cache";

/** Removes query data persisted by releases that predate the in-memory cache. */
export function clearLegacyPersistedQueryCache(): void {
  window.localStorage.removeItem(LEGACY_QUERY_CACHE_STORAGE_KEY);
}

/**
 * Clears all in-memory and persisted data before a newly authenticated account
 * enters the app, preventing the prior account's ledger from rendering.
 *
 * @param queryClient - App-wide TanStack Query client.
 */
export function clearAccountQueryCache(queryClient: QueryClient): void {
  queryClient.clear();
  clearLegacyPersistedQueryCache();
}
