/** Per-request Connect plumbing: caller auth (bearer/cookie), session cookies, UsecaseError → ConnectError mapping. */

import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { verifyToken } from "@/server/auth/usecase/auth.usecase";
import { UsecaseError } from "@/server/common/errors";
import { CODE_MAP, COOKIE_MAX_AGE, SESSION_COOKIE, sessionCookieAttributes } from "./connect.constants";

/**
 * Extracts the authenticated user id from request headers: Bearer header
 * (mobile) first, session cookie (web) second.
 *
 * @param headers - Incoming request headers to inspect for credentials.
 * @returns The verified user id, or null when no valid credential is present.
 */
export function userIdFromHeaders(headers: Headers): string | null {
  const authorizationHeader = headers.get("authorization");
  if (authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    return verifyToken(authorizationHeader.slice(7).trim());
  }
  const cookies = headers.get("cookie");
  if (cookies) {
    for (const cookiePart of cookies.split(";")) {
      const [cookieName, ...valueParts] = cookiePart.trim().split("=");
      if (cookieName === SESSION_COOKIE) return verifyToken(valueParts.join("="));
    }
  }
  return null;
}

/**
 * Returns the calling user's id, rejecting the request when unauthenticated.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @returns The verified user id.
 * @throws ConnectError with Code.Unauthenticated when no valid credential is present.
 */
export function requireUser(handlerContext: HandlerContext): string {
  const userId = userIdFromHeaders(handlerContext.requestHeader);
  if (!userId) throw new ConnectError("sign in to continue", Code.Unauthenticated);
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
 *
 * @param operation - Usecase invocation to execute.
 * @returns Whatever operation resolves to.
 * @throws ConnectError translated from any UsecaseError thrown by the operation;
 *   other errors are rethrown unchanged.
 */
export async function runUsecase<UsecaseResult>(
  operation: () => UsecaseResult | Promise<UsecaseResult>,
): Promise<UsecaseResult> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof UsecaseError) {
      throw new ConnectError(error.message, CODE_MAP[error.code]);
    }
    throw error;
  }
}
