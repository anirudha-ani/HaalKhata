/** App-wide client providers: TanStack Query (memory only), session hydration, foreground refetch. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { focusManager, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { AppState } from "react-native";
import { QUERY_CACHE_STORAGE_KEY } from "@/lib/api/api.constants";
import { mobileQueryClient } from "@/lib/api/queryCache";
import { hydrateSession } from "@/lib/api/session";

/**
 * Wraps the app in client-side providers: a single TanStack Query client
 * (10s stale time, one retry) whose cache lives in memory only.
 *
 * It used to be persisted to AsyncStorage so a cold launch could paint the
 * last-known screens. That cache held balances, expenses, the feed, the
 * user's own email and phone and everyone's payment handles — in plaintext,
 * under the app's storage directory, for a day. OWASP MASVS-STORAGE calls
 * for sensitive data at rest to be encrypted with a Keystore/Keychain-held
 * key, and the honest alternative for a financial app with no offline
 * requirement is not to write it at all: the cache is memory now, and one
 * network round trip on launch is the price. Any cache a previous version
 * persisted is removed on first start.
 *
 * Also hydrates the bearer session from SecureStore once at startup, and
 * wires the AppState so returning to the foreground counts as "window focus"
 * (stale queries refetch, matching the web's refetch-on-focus behavior).
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
  useEffect(() => {
    void hydrateSession();
    // Versions before this one persisted the whole query cache here.
    AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY).catch(() => {
      // Nothing to remove, or storage unavailable — either way nothing persists now.
    });
  }, []);

  useEffect(() => {
    // TanStack Query's "window focus" on native = the app returning to the foreground.
    const subscription = AppState.addEventListener("change", (status) =>
      focusManager.setFocused(status === "active"),
    );
    return () => subscription.remove();
  }, []);

  return <QueryClientProvider client={mobileQueryClient}>{children}</QueryClientProvider>;
}
