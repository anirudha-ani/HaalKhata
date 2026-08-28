/** Constants for the mobile API layer: server URL resolution and storage keys. */

import Constants from "expo-constants";
import { Platform } from "react-native";
import { buildApiBaseUrl } from "./apiUrl";

/** SecureStore key under which the bearer session token is persisted. */
export const TOKEN_STORAGE_KEY = "haalkhata-session-token";

/** AsyncStorage key for the persisted TanStack Query cache. */
export const QUERY_CACHE_STORAGE_KEY = "haalkhata-query-cache";

/** Port the Next.js dev server listens on. */
const DEV_SERVER_PORT = 3000;

/** Returns whether Metro produced a development bundle. */
function developmentBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

/**
 * Derives the local HTTP origin used only by a development bundle.
 *
 * @returns Emulator, Metro-host, or localhost origin for the dev server.
 */
function developmentOrigin(): string {
  if (Platform.OS === "android") return `http://10.0.2.2:${DEV_SERVER_PORT}`;

  const hostUri = Constants.expoConfig?.hostUri ?? "";
  const host = hostUri.split(":")[0];
  return `http://${host || "localhost"}:${DEV_SERVER_PORT}`;
}

/**
 * Resolves the Connect API base URL. `EXPO_PUBLIC_API_URL` (the server
 * origin, e.g. "https://khata.example.com") wins when set; otherwise the
 * host is derived from the Metro bundler URL so a device on the same LAN
 * reaches the dev server running next to Metro.
 *
 * HTTP fallback is available only in development. Release bundles require an
 * explicit HTTPS origin and fail before creating a bearer-token transport.
 * The Android emulator is special: it runs in its own network namespace
 * and cannot reach the host's LAN IP. It must use the alias `10.0.2.2`,
 * which routes to the host's 127.0.0.1. The iOS simulator shares the
 * host's network stack and can use `localhost` directly.
 *
 * @returns The absolute base URL of the Connect endpoint (".../api/connect").
 */
export function resolveApiBaseUrl(): string {
  return buildApiBaseUrl(
    process.env.EXPO_PUBLIC_API_URL,
    developmentBuild(),
    developmentOrigin(),
  );
}
