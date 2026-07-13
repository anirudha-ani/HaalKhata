"use client";
/** App-wide client providers: TanStack Query client with localStorage persistence. */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Wraps the app in client-side providers: a single TanStack Query client (10s
 * stale time, one retry, refetch on window focus) whose cache is persisted to
 * localStorage so a PWA reload (or a service-worker-served shell) renders the
 * last-known data immediately instead of flashing loading spinners.
 *
 * The persister is created once and wired via `persistQueryClient` in an effect.
 * `gcTime` is bumped so persisted entries survive longer than the default 5min
 * garbage-collection window; stale entries are still refetched on mount per
 * `staleTime`, so the user sees cached data first, then a fresh fetch.
 *
 * @param props - Provider props.
 * @param props.children - The app subtree that should have access to the providers.
 * @returns The QueryClientProvider-wrapped subtree with a localStorage persister.
 */
export function Providers({
  children,
}: {
  /** The app subtree that should have access to the providers. */
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            gcTime: 1000 * 60 * 60 * 24, // keep persisted cache for 24h
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  useEffect(() => {
    // localStorage only exists in the browser; this effect never runs on the server.
    const localStoragePersister = createSyncStoragePersister({
      storage: window.localStorage,
      key: "haalkhata-query-cache",
    });
    const [unsubscribe] = persistQueryClient({
      queryClient,
      persister: localStoragePersister,
      buster: CACHE_BUSTER,
    });
    return unsubscribe;
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * Value mixed into the persisted cache key. Bump this when the query shape
 * changes incompatibly (e.g. a proto field rename) so stale persisted entries
 * are discarded instead of rendering with a wrong shape.
 */
const CACHE_BUSTER = "v1";
