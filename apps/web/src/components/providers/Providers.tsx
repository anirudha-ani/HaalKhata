"use client";
/** App-wide client providers: TanStack Query client. */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * Wraps the app in client-side providers — currently a single TanStack Query
 * client (10s stale time, one retry, refetch on window focus) created once per
 * mount.
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
          queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
