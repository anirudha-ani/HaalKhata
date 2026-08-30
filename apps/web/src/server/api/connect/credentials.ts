/** Canonical parsing for Connect bearer and cookie credentials. */

import { BEARER_TRANSPORT, SESSION_TRANSPORT_HEADER } from "@haalkhata/shared/auth/sessionRenewal";
import { SESSION_COOKIE } from "./connect.constants";

/**
 * Whether the client asked to receive its session as a bearer token.
 *
 * A browser keeps its session in an HttpOnly cookie precisely so script
 * cannot read it; handing the same token back in the JSON body would undo
 * that for any script running during sign-in. So the token is returned
 * only to clients that say they carry it as a bearer credential — the
 * mobile app sets this header on every request.
 *
 * @param headers - Incoming request headers.
 * @returns True when the response should carry the bearer token.
 */
export function wantsBearerToken(headers: Headers): boolean {
  return headers.get(SESSION_TRANSPORT_HEADER) === BEARER_TRANSPORT;
}

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
 * Extracts the one unambiguous session token from a Cookie header.
 * Duplicate names are rejected instead of accepting proxy/browser-dependent
 * ordering, which prevents cookie tossing from selecting an attacker value.
 *
 * @param cookieHeader - Raw Cookie request-header value.
 * @returns The session token, or null when absent, empty, or duplicated.
 */
export function sessionTokenFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  let sessionToken: string | null = null;
  for (const cookiePart of (cookieHeader ?? "").split(";")) {
    const [cookieName, ...valueParts] = cookiePart.trim().split("=");
    if (cookieName !== SESSION_COOKIE) continue;
    if (sessionToken !== null) return null;
    sessionToken = valueParts.join("=");
  }
  return sessionToken || null;
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

  return sessionTokenFromCookieHeader(headers.get("cookie"));
}
