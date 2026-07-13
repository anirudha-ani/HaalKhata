/** Per-request Connect plumbing: caller auth (bearer/cookie), session cookies, UsecaseError → ConnectError mapping. */

import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { tokenVersion, verifyToken } from "@/server/auth/usecase/auth.usecase";
import { findUserTokenVersion } from "@/server/auth/repo/users.repo";
import { UsecaseError } from "@/server/common/errors";
import { logError } from "@/server/common/logger";
import { CODE_MAP, COOKIE_MAX_AGE, SESSION_COOKIE, sessionCookieAttributes } from "./connect.constants";

/**
 * Extracts the bearer token string from request headers: Authorization header
 * (mobile) first, session cookie (web) second. Returns null when no credential
 * is present. Does NOT verify the token — callers pair this with verifyToken.
 *
 * @param headers - Incoming request headers to inspect for credentials.
 * @returns The raw token string, or null when no credential is present.
 */
export function tokenFromHeaders(headers: Headers): string | null {
  const authorizationHeader = headers.get("authorization");
  if (authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice(7).trim();
  }
  const cookies = headers.get("cookie");
  if (cookies) {
    for (const cookiePart of cookies.split(";")) {
      const [cookieName, ...valueParts] = cookiePart.trim().split("=");
      if (cookieName === SESSION_COOKIE) return valueParts.join("=");
    }
  }
  return null;
}

/**
 * Returns the calling user's id, rejecting the request when unauthenticated.
 * The bearer token's embedded version is checked against the user's current
 * `token_version` so that logout / password change revokes outstanding tokens.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @returns The verified user id.
 * @throws ConnectError with Code.Unauthenticated when no valid credential is
 *   present or the token version no longer matches the user row.
 */
export async function requireUser(handlerContext: HandlerContext): Promise<string> {
  const token = tokenFromHeaders(handlerContext.requestHeader);
  const userId = token ? verifyToken(token) : null;
  if (!userId || !token) {
    throw new ConnectError("sign in to continue", Code.Unauthenticated);
  }
  const embeddedVersion = tokenVersion(token);
  const currentVersion = await findUserTokenVersion(userId);
  if (currentVersion === undefined || currentVersion !== embeddedVersion) {
    throw new ConnectError("session expired, please sign in again", Code.Unauthenticated);
  }
  return userId;
}

/**
 * Appends a Set-Cookie response header that stores the session token for web clients.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @param token - Signed session token to persist in the cookie.
 */
export function setSessionCookie(handlerContext: HandlerContext, token: string): void {
  handlerContext.responseHeader.append(
    "set-cookie",
    sessionCookieAttributes(token, COOKIE_MAX_AGE),
  );
}

/**
 * Appends a Set-Cookie response header that expires the session cookie immediately.
 *
 * @param handlerContext - Connect handler context for the current request.
 */
export function clearSessionCookie(handlerContext: HandlerContext): void {
  handlerContext.responseHeader.append(
    "set-cookie",
    sessionCookieAttributes("", 0),
  );
}

/**
 * Runs a usecase call and maps UsecaseError codes onto Connect codes.
 * Unexpected (non-UsecaseError) exceptions are logged with the RPC method
 * name and a random request id before rethrowing, so production deploys
 * aren't flying blind with stack traces in stdout and no correlation.
 *
 * @param operation - Usecase invocation to execute.
 * @param handlerContext - Connect context for the current RPC (used for the
 *   method name in logs); omitted by non-RPC callers.
 * @returns Whatever operation resolves to.
 * @throws ConnectError translated from any UsecaseError thrown by the
 *   operation; other errors are logged then rethrown unchanged.
 */
export async function runUsecase<UsecaseResult>(
  operation: () => UsecaseResult | Promise<UsecaseResult>,
  handlerContext?: HandlerContext,
): Promise<UsecaseResult> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof UsecaseError) {
      throw new ConnectError(error.message, CODE_MAP[error.code]);
    }
    logError(error, {
      rpc: handlerContext?.method.name ?? "unknown",
      requestId: crypto.randomUUID(),
    });
    throw error;
  }
}
