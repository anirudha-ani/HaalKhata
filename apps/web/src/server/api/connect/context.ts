/** Per-request Connect plumbing: caller auth (bearer/cookie), session cookies, UsecaseError → ConnectError mapping. */

import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { SESSION_RENEWAL_HEADER } from "@haalkhata/shared/auth/sessionRenewal";
import {
  createToken,
  isLegacyToken,
  sessionIsLive,
  tokenExpiresAt,
  tokenSessionId,
  tokenVersion,
  verifyToken,
  type SessionStanding,
} from "@/server/auth/usecase/session/session";
import { findSessionStanding, insertSession, touchSession } from "@/server/auth/repo/sessions.repo";
import { TOKEN_LIFETIME_SECONDS, TOKEN_RENEWAL_THRESHOLD_SECONDS } from "@/server/auth/auth.constants";
import { UsecaseError } from "@/server/common/errors";
import { logError } from "@/server/common/logger";
import { CODE_MAP, COOKIE_MAX_AGE, SIGN_IN_REQUIRED_MESSAGE, sessionCookieAttributes } from "./connect.constants";
import { bearerTokenFromAuthorization, tokenFromHeaders } from "./session/credentials";
import { describeDevice } from "./session/device";

/** The one RPC that must not hand back a fresh session on its way out. */
const LOG_OUT_METHOD = "LogOut";

/**
 * The request gate for every call that needs a session: runs once the
 * headers are in, before the body is read, decompressed or parsed. A caller
 * without a validly signed, unexpired session token is refused right there,
 * so an anonymous request costs its headers and nothing more. Only the
 * signature is checked — no database read; whether the session was revoked
 * is {@link requireUser}'s job inside the handler.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @throws ConnectError with Code.Unauthenticated when no valid session token is present.
 */
export function requireSignedSession(handlerContext: HandlerContext): void {
  const token = tokenFromHeaders(handlerContext.requestHeader);
  if (!token || !verifyToken(token)) {
    throw new ConnectError(SIGN_IN_REQUIRED_MESSAGE, Code.Unauthenticated);
  }
}

/**
 * Returns the calling user's id, rejecting the request when unauthenticated.
 * The token's session is checked against its row on every request, so
 * signing a device out takes effect on that device's very next call.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @returns The verified user id.
 * @throws ConnectError with Code.Unauthenticated when no valid credential is
 *   present or the session has ended.
 */
export async function requireUser(handlerContext: HandlerContext): Promise<string> {
  const token = tokenFromHeaders(handlerContext.requestHeader);
  const userId = token ? verifyToken(token) : null;
  if (!userId || !token) {
    throw new ConnectError(SIGN_IN_REQUIRED_MESSAGE, Code.Unauthenticated);
  }
  const standing = await findSessionStanding(userId, tokenSessionId(token));
  if (!standing || !sessionIsLive(token, standing)) {
    throw new ConnectError("session expired, please sign in again", Code.Unauthenticated);
  }
  await keepSessionFresh(handlerContext, token, userId, standing);
  return userId;
}

/**
 * The session a request came in on. Only meaningful after {@link requireUser}
 * has accepted it, which gave an older token its row.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @returns The session's id, or "" without a session token.
 */
export function currentSessionId(handlerContext: HandlerContext): string {
  const token = tokenFromHeaders(handlerContext.requestHeader);
  return token ? tokenSessionId(token) : "";
}

/**
 * The token version baked into the request's verified session token. Only
 * meaningful after {@link requireUser} has accepted the request, which proved
 * it equals the account's version at that moment. A write that must bind to
 * the session (a phone registered under it) uses this rather than reading the
 * account's version again: a sign-out landing in between would otherwise
 * hand the write the new version and outlive the session that made it.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @returns The session's token version, or NaN without a session token.
 */
export function sessionTokenVersion(handlerContext: HandlerContext): number {
  const token = tokenFromHeaders(handlerContext.requestHeader);
  return token ? tokenVersion(token) : Number.NaN;
}

/**
 * Brings a live session up to date. An older token gets its row and is swapped
 * for a current one, the first time it is used. Otherwise a session is
 * re-issued once it is a day old, so its lifetime counts from the last time
 * the person opened the app, and only a very long absence or signing out ends
 * it. The fresh token travels the way the old one arrived: a cookie for the
 * browser, a response header the mobile transport stores. Sign-out is
 * skipped, or the renewal would race the cookie clear and the mobile token
 * delete. A failure here costs a renewal and never the request.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @param token - The verified token the request arrived with.
 * @param userId - Its verified user id.
 * @param standing - What the database says of its session.
 */
async function keepSessionFresh(
  handlerContext: HandlerContext,
  token: string,
  userId: string,
  standing: SessionStanding,
): Promise<void> {
  const sessionId = tokenSessionId(token);
  const legacy = isLegacyToken(token);
  const aging = tokenExpiresAt(token) - Date.now() / 1000 < TOKEN_RENEWAL_THRESHOLD_SECONDS;
  try {
    if (legacy && !standing.session_found) {
      const device = describeDevice(handlerContext.requestHeader);
      await insertSession({
        id: sessionId,
        userId,
        device: device.label,
        isApp: device.isApp,
        tokenVersion: standing.token_version,
        lifetimeSeconds: TOKEN_LIFETIME_SECONDS,
      });
    }
    if (handlerContext.method.name === LOG_OUT_METHOD || !(legacy || aging)) return;
    await touchSession(sessionId, TOKEN_LIFETIME_SECONDS);
  } catch (failure) {
    logError(failure, { scope: "session-renewal" });
    return;
  }
  const renewed = createToken(userId, standing.token_version, sessionId);
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
