/** Transport-layer constants: session cookie settings and error-code mapping. */

import { Code } from "@connectrpc/connect";
import type { UsecaseErrorCode } from "@/server/common/errors";

/**
 * Name of the HTTP cookie that carries the web client's session token.
 * Production uses the browser-enforced `__Host-` prefix; development keeps a
 * plain name so LAN-hosted HTTP sessions continue to work.
 */
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-hk_token" : "hk_token";

/** Session cookie lifetime in seconds (30 days), matching the token lifetime. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Largest decoded Connect request accepted by the application. Receipt images
 * are capped at 8 MiB; 12 MiB leaves room for protobuf/JSON base64 overhead
 * while rejecting bodies before a handler or authentication lookup runs.
 */
export const CONNECT_READ_MAX_BYTES = 12 * 1024 * 1024;

/**
 * Builds the Set-Cookie attribute string for the session token. The `Secure`
 * flag is added only in production so dev over plain HTTP (localhost) still
 * works; production must run behind a TLS-terminating reverse proxy.
 *
 * @param token - Session token value, or empty string to clear the cookie.
 * @param maxAge - Lifetime in seconds; pass 0 to expire immediately.
 * @returns The full session-cookie attribute string for Set-Cookie.
 */
export function sessionCookieAttributes(token: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`;
}

/** Lookup from UsecaseErrorCode to the equivalent Connect status code. */
export const CODE_MAP: Record<UsecaseErrorCode, Code> = {
  invalid_argument: Code.InvalidArgument,
  unauthenticated: Code.Unauthenticated,
  permission_denied: Code.PermissionDenied,
  not_found: Code.NotFound,
  already_exists: Code.AlreadyExists,
  unavailable: Code.Unavailable,
};
