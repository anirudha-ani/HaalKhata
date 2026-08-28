/** App-wide client providers: TanStack Query with AsyncStorage persistence, session hydration, foreground refetch. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { QUERY_CACHE_STORAGE_KEY } from "@/lib/api/api.constants";
import { mobileQueryClient } from "@/lib/api/queryCache";
import { hydrateSession } from "@/lib/api/session";

/**
 * Wraps the app in client-side providers: a single TanStack Query client
 * (10s stale time, one retry) whose cache is persisted to AsyncStorage so a
 * cold launch renders the last-known data immediately instead of flashing
 * spinners — the mobile counterpart of the web app's localStorage persistence.
 *
 * Also hydrates the bearer session from SecureStore once at startup, and
 * wires the AppState so returning to the foreground counts as "window focus"
 * (stale queries refetch, matching the web's refetch-on-focus behavior).
 *
 * @param props - Provider props.
 * @param props.children - The app subtree that should have access to the providers.
 * @returns The PersistQueryClientProvider-wrapped subtree.
 */
export function Providers({
  children,
}: {
  /** The app subtree that should have access to the providers. */
  children: ReactNode;
}) {
  const [persister] = useState(() =>
    createAsyncStoragePersister({ storage: AsyncStorage, key: QUERY_CACHE_STORAGE_KEY }),
  );

  useEffect(() => {
    void hydrateSession();
  }, []);

  useEffect(() => {
    // TanStack Query's "window focus" on native = the app returning to the foreground.
    const subscription = AppState.addEventListener("change", (status) =>
      focusManager.setFocused(status === "active"),
    );
    return () => subscription.remove();
  }, []);

  return (
    <PersistQueryClientProvider
      client={mobileQueryClient}
      persistOptions={{ persister, buster: CACHE_BUSTER }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

/**
 * Value mixed into the persisted cache key. Bump this when the query shape
 * changes incompatibly (e.g. a proto field rename) so stale persisted entries
 * are discarded instead of rendering with a wrong shape.
 */
const CACHE_BUSTER = "v1";
