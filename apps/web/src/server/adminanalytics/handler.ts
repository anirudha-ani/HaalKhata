/**
 * Thin AdminAnalyticsService Connect handlers: the surface check, the admin
 * cookie and the rate limits live here; the logic is in the usecases.
 */

import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import type { AdminAnalyticsService } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { requestSurface } from "@/config/adminSurface";
import { runUsecase } from "@/server/api/connect/context";
import { uniqueCookieValue } from "@/server/api/connect/credentials";
import { clientIp } from "@/server/auth/clientIp";
import { rateLimitCheck } from "@/server/common/rateLimit";
import {
  ADMIN_AUTH_RATE_LIMIT,
  ADMIN_READ_RATE_LIMIT,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_LIFETIME_SECONDS,
  adminSessionCookieAttributes,
} from "@/server/adminanalytics/adminanalytics.constants";
import * as adminSession from "@/server/adminanalytics/usecase/adminSession.usecase";
import { getUsageOverview } from "@/server/adminanalytics/usecase/usage.usecase";

/**
 * Refuses a request that did not arrive on the admin surface.
 *
 * The Connect mount already turns these away before any handler runs. This
 * repeats the check where the service lives, so that a second mount, or a
 * change to the first, cannot expose the service on the app's hostname by
 * forgetting it. Answered as "not found": on the app host this service
 * does not exist.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @throws ConnectError with Code.NotFound on the app surface.
 */
function requireAdminSurface(handlerContext: HandlerContext): void {
  if (requestSurface(handlerContext.requestHeader.get("host")) === "app") {
    throw new ConnectError("not found", Code.NotFound);
  }
}

/**
 * Refuses a request that was not started by the admin page itself: its
 * Origin must name the very host it was sent to.
 *
 * The app and the admin page are different origins but the same site, so
 * SameSite does nothing between them: a request to this host started by a
 * script on the app's hostname would arrive with the admin cookie attached.
 * The mount's CSRF guard already refuses that, but it was written for the
 * app, where a bearer token is a legitimate credential and exempts a
 * request from the check. Nothing here is ever authorized by a bearer
 * token, so this service makes the check itself, with no exemption and
 * whether or not a cookie came along. A browser sends Origin on every POST
 * it makes; only something that is not the admin page lacks a matching one.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @throws ConnectError with Code.PermissionDenied for a missing, malformed
 *   or foreign Origin.
 */
function requireSameOrigin(handlerContext: HandlerContext): void {
  const requestHost = handlerContext.requestHeader.get("host") ?? "";
  let originHost = "";
  try {
    originHost = new URL(handlerContext.requestHeader.get("origin") ?? "").host;
  } catch {
    // Absent or malformed: falls through to the refusal below.
  }
  if (originHost === "" || originHost !== requestHost) {
    throw new ConnectError("cross-origin request blocked", Code.PermissionDenied);
  }
}

/**
 * Confirms a request belongs on this service at all: it arrived on the
 * admin surface, and the admin page is what sent it. Every method starts
 * here, before reading a cookie or spending a rate-limit slot.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @throws ConnectError NotFound on the app surface, PermissionDenied for a
 *   request another origin started.
 */
function requireAdminPageRequest(handlerContext: HandlerContext): void {
  requireAdminSurface(handlerContext);
  requireSameOrigin(handlerContext);
}

/**
 * Enforces the per-address sign-in limit.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @throws ConnectError with Code.ResourceExhausted when rate-limited.
 */
function enforceAdminAuthRateLimit(handlerContext: HandlerContext): void {
  if (
    !rateLimitCheck(`admin-auth:${clientIp(handlerContext.requestHeader)}`, ADMIN_AUTH_RATE_LIMIT)
  ) {
    throw new ConnectError("too many attempts, please try again later", Code.ResourceExhausted);
  }
}

/**
 * Reads the admin session token off the request. The cookie is the only
 * place it is accepted from: an Authorization header is ignored here, so a
 * bearer credential of any kind is never an admin credential.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @returns The raw token, or null when absent, empty, or duplicated.
 */
function adminSessionToken(handlerContext: HandlerContext): string | null {
  return uniqueCookieValue(handlerContext.requestHeader.get("cookie"), ADMIN_SESSION_COOKIE);
}

/** AdminAnalyticsService implementation. Every method starts by confirming the surface and the origin. */
export const adminAnalyticsHandler: ServiceImpl<typeof AdminAnalyticsService> = {
  /** Issues the nonce for an admin sign-in. */
  async beginSignIn(_request, handlerContext) {
    requireAdminPageRequest(handlerContext);
    enforceAdminAuthRateLimit(handlerContext);
    return runUsecase(() => adminSession.beginAdminSignIn(), handlerContext);
  },

  /** Verifies the Google identity and, for an allowlisted address, sets the admin cookie. */
  async signIn(request, handlerContext) {
    requireAdminPageRequest(handlerContext);
    enforceAdminAuthRateLimit(handlerContext);
    const { token } = await runUsecase(
      () => adminSession.signInAdmin(request.idToken),
      handlerContext,
    );
    handlerContext.responseHeader.append(
      "set-cookie",
      adminSessionCookieAttributes(token, ADMIN_SESSION_LIFETIME_SECONDS),
    );
    return {};
  },

  /**
   * Ends the session on the server and, only once that has happened,
   * expires the cookie.
   *
   * The order is the point. The cookie is the browser's only handle on the
   * session. Expiring it when the row could not be deleted would leave a
   * session that is still valid on the server and that the operator can no
   * longer end, while telling them they are signed out. Kept, they are
   * still signed in, are told so, and can try again.
   */
  async signOut(_request, handlerContext) {
    requireAdminPageRequest(handlerContext);
    await runUsecase(
      () => adminSession.signOutAdmin(adminSessionToken(handlerContext)),
      handlerContext,
    );
    handlerContext.responseHeader.append("set-cookie", adminSessionCookieAttributes("", 0));
    return {};
  },

  /** The usage overview, for a live admin session only. */
  async getUsageOverview(_request, handlerContext) {
    requireAdminPageRequest(handlerContext);
    return runUsecase(async () => {
      await adminSession.requireAdminSession(adminSessionToken(handlerContext));
      if (!rateLimitCheck("admin-usage-overview", ADMIN_READ_RATE_LIMIT)) {
        throw new ConnectError("too many requests, please try again later", Code.ResourceExhausted);
      }
      return getUsageOverview();
    }, handlerContext);
  },
};
