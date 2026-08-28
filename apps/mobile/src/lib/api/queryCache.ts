/** Account-safe ownership and clearing of the mobile TanStack Query cache. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
import { QUERY_CACHE_STORAGE_KEY } from "./api.constants";

/**
 * Process-wide mobile query client shared by the provider and auth boundary.
 * Keeping it here lets a transport-level 401 erase in-memory account data
 * without importing React components into the API transport.
 */
export const mobileQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
    },
  },
});

/**
 * Erases both live and persisted query data at an authentication boundary.
 * The memory clear is deliberately synchronous and first, so a storage error
 * cannot leave the previous account visible during the current process.
 *
 * @returns A promise that resolves after the persisted cache has been removed.
 */
export async function clearMobileQueryCache(): Promise<void> {
  mobileQueryClient.clear();
  await AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
}
