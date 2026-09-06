/** Per-request Connect plumbing: caller auth (bearer/cookie), session cookies, UsecaseError → ConnectError mapping. */

import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { SESSION_RENEWAL_HEADER } from "@haalkhata/shared/auth/sessionRenewal";
import {
  createToken,
  tokenExpiresAt,
  tokenVersion,
  verifyToken,
} from "@/server/auth/usecase/auth.usecase";
import { findUserTokenVersion } from "@/server/auth/repo/users.repo";
import { TOKEN_RENEWAL_THRESHOLD_SECONDS } from "@/server/auth/auth.constants";
import { UsecaseError } from "@/server/common/errors";
import { logError } from "@/server/common/logger";
import { CODE_MAP, COOKIE_MAX_AGE, sessionCookieAttributes } from "./connect.constants";
import { bearerTokenFromAuthorization, tokenFromHeaders } from "./credentials";

/** The one RPC that must not hand back a fresh session on its way out. */
const LOG_OUT_METHOD = "LogOut";

/**
 * Returns the calling user's id, rejecting the request when unauthenticated.
 * The bearer token's embedded version is checked against the user's current
 * `token_version` so that signing out revokes outstanding tokens.
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
  renewAgingSession(handlerContext, token, userId, currentVersion);
  return userId;
}

/**
 * Re-issues a session that has used up more than half its lifetime, so a
 * person who keeps using the app is never signed out by the absolute token
 * limit — only by inactivity or by signing out. The fresh token travels the
 * way the old one arrived: a cookie for the browser, a response header the
 * mobile transport stores. Sign-out is skipped, or the renewal would race the
 * cookie clear and the mobile token delete.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @param token - The verified token the request arrived with.
 * @param userId - Its verified user id.
 * @param currentVersion - The user's current token_version, baked into the renewal.
 */
function renewAgingSession(
  handlerContext: HandlerContext,
  token: string,
  userId: string,
  currentVersion: number,
): void {
  if (handlerContext.method.name === LOG_OUT_METHOD) return;
  const remainingSeconds = tokenExpiresAt(token) - Date.now() / 1000;
  if (!(remainingSeconds < TOKEN_RENEWAL_THRESHOLD_SECONDS)) return;
  const renewed = createToken(userId, currentVersion);
  if (bearerTokenFromAuthorization(handlerContext.requestHeader.get("authorization"))) {
    handlerContext.responseHeader.set(SESSION_RENEWAL_HEADER, renewed);
    return;
  }
  setSessionCookie(handlerContext, renewed);
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
 * name and a random request id. Clients receive only a generic Internal error
 * carrying that correlation id; database/provider messages stay server-side.
 *
 * @param operation - Usecase invocation to execute.
 * @param handlerContext - Connect context for the current RPC (used for the
 *   method name in logs); omitted by non-RPC callers.
 * @returns Whatever operation resolves to.
 * @throws ConnectError translated from any UsecaseError thrown by the
 *   operation; existing ConnectErrors pass through; unexpected errors become
 *   generic Internal responses after structured logging.
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
    if (error instanceof ConnectError) throw error;
    const requestId = crypto.randomUUID();
    logError(error, {
      rpc: handlerContext?.method.name ?? "unknown",
      requestId,
    });
    throw new ConnectError(`internal server error (request ${requestId})`, Code.Internal);
  }
}
