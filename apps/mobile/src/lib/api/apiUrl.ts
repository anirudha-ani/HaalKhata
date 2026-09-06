/** Pure validation and construction for the mobile Connect API URL. */

/** Path mounted by the web app's Connect router. */
const CONNECT_API_PATH = "/api/connect";

/**
 * Builds the mobile Connect URL while refusing plaintext transport in release
 * builds. The configured value must be an origin rather than a path-bearing
 * URL, which keeps endpoint construction deterministic.
 *
 * @param configuredOrigin - Optional EXPO_PUBLIC_API_URL build-time value.
 * @param development - Whether this is a development bundle.
 * @param developmentOrigin - HTTP origin derived from Metro for local development.
 * @returns Validated absolute Connect endpoint URL.
 * @throws Error for missing release configuration or an unsafe/malformed origin.
 */
export function buildApiBaseUrl(
  configuredOrigin: string | undefined,
  development: boolean,
  developmentOrigin: string,
): string {
  if (!configuredOrigin && !development) {
    throw new Error("EXPO_PUBLIC_API_URL must be configured for release builds");
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(configuredOrigin ?? developmentOrigin);
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL must be an absolute HTTP(S) origin");
  }

  if (parsedOrigin.protocol !== "https:" && !(development && parsedOrigin.protocol === "http:")) {
    throw new Error("EXPO_PUBLIC_API_URL must use HTTPS outside development");
  }
  if (
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    throw new Error("EXPO_PUBLIC_API_URL must contain only an origin");
  }
  return `${parsedOrigin.origin}${CONNECT_API_PATH}`;
}
