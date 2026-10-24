/**
 * Transport checks every admin service makes before it reads a cookie or
 * spends a rate-limit slot: the request is on the admin surface, and the
 * admin page itself started it. Shared by AdminAnalyticsService and
 * AdminModerationService so the two cannot drift apart.
 */

import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { requestSurface } from "@/config/adminSurface";
import { uniqueCookieValue } from "@/server/api/connect/credentials";
import { ADMIN_SESSION_COOKIE } from "@/server/adminanalytics/adminanalytics.constants";

/**
 * Refuses a request that did not arrive on the admin surface.
 *
 * The Connect mount already turns these away before any handler runs. This
 * repeats the check where the services live, so that a second mount, or a
 * change to the first, cannot expose them on the app's hostname by
 * forgetting it. Answered as "not found": on the app host these services do
 * not exist.
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
 * request from the check. Nothing on the admin surface is ever authorized
 * by a bearer token, so the admin services make the check themselves, with
 * no exemption and whether or not a cookie came along. A browser sends
 * Origin on every POST it makes; only something that is not the admin page
 * lacks a matching one.
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
 * Confirms a request belongs on an admin service at all: it arrived on the
 * admin surface, and the admin page is what sent it. Every admin method
 * starts here.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @throws ConnectError NotFound on the app surface, PermissionDenied for a
 *   request another origin started.
 */
export function requireAdminPageRequest(handlerContext: HandlerContext): void {
  requireAdminSurface(handlerContext);
  requireSameOrigin(handlerContext);
}

/**
 * Reads the admin session token off the request. The cookie is the only
 * place it is accepted from: an Authorization header is ignored here, so a
 * bearer credential of any kind is never an admin credential.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @returns The raw token, or null when absent, empty, or duplicated.
 */
export function adminSessionToken(handlerContext: HandlerContext): string | null {
  return uniqueCookieValue(handlerContext.requestHeader.get("cookie"), ADMIN_SESSION_COOKIE);
}
