"use client";
/** App-wide client providers with an in-memory TanStack Query cache. */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { clearLegacyPersistedQueryCache } from "@/lib/api/queryCache";

/**
 * Wraps the app in one TanStack Query client with a short-lived, memory-only
 * cache. Ledger and profile responses disappear when the tab closes and are
 * garbage-collected after five inactive minutes rather than being serialized
 * as plaintext browser storage.
 *
 * @param props - Provider props.
 * @param props.children - The app subtree that should have access to the providers.
 * @returns The QueryClientProvider-wrapped subtree.
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
            gcTime: 1000 * 60 * 5,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  useEffect(() => {
    clearLegacyPersistedQueryCache();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
