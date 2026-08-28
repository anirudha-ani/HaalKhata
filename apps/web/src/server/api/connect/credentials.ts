/** Canonical parsing for Connect bearer and cookie credentials. */

import { SESSION_COOKIE } from "./connect.constants";

/**
 * Parses the exact Bearer authorization syntax accepted by the server.
 * Requiring one ASCII space and a whitespace-free token keeps authentication
 * and CSRF classification in agreement for malformed headers.
 *
 * @param authorizationHeader - Raw Authorization header value.
 * @returns The bearer token, or null when the header is not canonical.
 */
export function bearerTokenFromAuthorization(
  authorizationHeader: string | null | undefined,
): string | null {
  const match = /^bearer ([^\s]+)$/i.exec(authorizationHeader ?? "");
  return match?.[1] ?? null;
}

/**
 * Extracts the bearer token (mobile) first, then the session cookie (web).
 * This function does not verify the token; callers pair it with verifyToken.
 *
 * @param headers - Incoming request headers to inspect for credentials.
 * @returns The raw token string, or null when no credential is present.
 */
export function tokenFromHeaders(headers: Headers): string | null {
  const bearerToken = bearerTokenFromAuthorization(headers.get("authorization"));
  if (bearerToken) return bearerToken;

  const cookies = headers.get("cookie");
  if (cookies) {
    for (const cookiePart of cookies.split(";")) {
      const [cookieName, ...valueParts] = cookiePart.trim().split("=");
      if (cookieName === SESSION_COOKIE) return valueParts.join("=");
    }
  }
  return null;
}
