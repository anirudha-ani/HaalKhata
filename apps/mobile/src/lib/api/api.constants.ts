/** Constants for the mobile API layer: server URL resolution and storage keys. */

import Constants from "expo-constants";

/** SecureStore key under which the bearer session token is persisted. */
export const TOKEN_STORAGE_KEY = "haalkhata-session-token";

/** AsyncStorage key for the persisted TanStack Query cache. */
export const QUERY_CACHE_STORAGE_KEY = "haalkhata-query-cache";

/** Port the Next.js dev server listens on. */
const DEV_SERVER_PORT = 3000;

/**
 * Resolves the Connect API base URL. `EXPO_PUBLIC_API_URL` (the server
 * origin, e.g. "https://khata.example.com") wins when set; otherwise the
 * host is derived from the Metro bundler URL so a phone on the same LAN
 * reaches the dev server running next to Metro.
 *
 * @returns The absolute base URL of the Connect endpoint (".../api/connect").
 */
export function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return `${configured.replace(/\/+$/, "")}/api/connect`;
  const hostUri = Constants.expoConfig?.hostUri ?? "";
  const host = hostUri.split(":")[0];
  if (host) return `http://${host}:${DEV_SERVER_PORT}/api/connect`;
  return `http://localhost:${DEV_SERVER_PORT}/api/connect`;
}
