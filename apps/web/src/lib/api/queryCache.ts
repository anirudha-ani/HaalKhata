/** Account-bound TanStack Query cache reset and legacy-storage cleanup. */

import type { QueryClient } from "@tanstack/react-query";

/** Former localStorage key, retained only so upgrades erase historical PII. */
export const LEGACY_QUERY_CACHE_STORAGE_KEY = "haalkhata-query-cache";

/**
 * Removes query data persisted by releases that predate the in-memory cache.
 * Browsers can deny storage access; that must not interrupt provider startup
 * or an authentication transition after the in-memory cache has been cleared.
 */
export function clearLegacyPersistedQueryCache(): void {
  try {
    window.localStorage.removeItem(LEGACY_QUERY_CACHE_STORAGE_KEY);
  } catch {
    // Storage cleanup is best-effort when the browser makes it inaccessible.
  }
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
