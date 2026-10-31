/** Session-scoped bearer authentication, renewal and rejection handling. */

import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import {
  BEARER_TRANSPORT,
  SESSION_RENEWAL_HEADER,
  SESSION_TRANSPORT_HEADER,
} from "@haalkhata/shared/auth/sessionRenewal";
import { clearMobileQueryCache } from "./queryCache";
import { clearSession, sessionRevision, sessionToken, setSessionToken } from "./session";

/**
 * Attaches the bearer token to every RPC, stores the renewed token the server
 * hands back once a session is a day old (so its lifetime counts from the last
 * time the app was opened), and signs the app out locally when the server
 * reports the token is no longer valid (revoked or expired), so the auth gate
 * returns the user to the login screen.
 */
export const authorization: Interceptor = (next) => async (request) => {
  // A call that brings its own credentials (finishing an earlier sign-out
  // with that session's token) is not about the current session: nothing is
  // attached, renewed or cleared for it.
  if (request.header.has("Authorization")) {
    request.header.set(SESSION_TRANSPORT_HEADER, BEARER_TRANSPORT);
    return next(request);
  }
  const token = sessionToken();
  const revision = sessionRevision();
  if (token) request.header.set("Authorization", `Bearer ${token}`);
  // Says how this client carries its session: the sign-in RPCs return the
  // bearer token only to a client that asks, and set a cookie for the rest.
  request.header.set(SESSION_TRANSPORT_HEADER, BEARER_TRANSPORT);
  try {
    const response = await next(request);
    const renewed = response.header.get(SESSION_RENEWAL_HEADER);
    // Only while this token is still the live one: a sign-out that raced the
    // response must not be undone by persisting a renewal for it.
    if (renewed && token && renewed !== token && sessionRevision() === revision) {
      await setSessionToken(renewed);
    }
    return response;
  } catch (error) {
    if (token && sessionRevision() === revision && error instanceof ConnectError && error.code === Code.Unauthenticated) {
      try {
        // Both clear in-memory state before awaiting either storage operation.
        await Promise.all([clearSession(), clearMobileQueryCache()]);
      } catch {
        // Memory was already cleared synchronously. Preserve the server's 401
        // rather than replacing it with an AsyncStorage cleanup failure.
      }
    }
    throw error;
  }
};
