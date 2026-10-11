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

/** AdminAnalyticsService implementation. Every method starts by confirming the surface. */
export const adminAnalyticsHandler: ServiceImpl<typeof AdminAnalyticsService> = {
  /** Issues the nonce for an admin sign-in. */
  async beginSignIn(_request, handlerContext) {
    requireAdminSurface(handlerContext);
    enforceAdminAuthRateLimit(handlerContext);
    return runUsecase(() => adminSession.beginAdminSignIn(), handlerContext);
  },

  /** Verifies the Google identity and, for an allowlisted address, sets the admin cookie. */
  async signIn(request, handlerContext) {
    requireAdminSurface(handlerContext);
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

  /** Ends the session on the server, then expires the cookie whatever the server said. */
  async signOut(_request, handlerContext) {
    requireAdminSurface(handlerContext);
    try {
      await runUsecase(
        () => adminSession.signOutAdmin(adminSessionToken(handlerContext)),
        handlerContext,
      );
    } finally {
      handlerContext.responseHeader.append("set-cookie", adminSessionCookieAttributes("", 0));
    }
    return {};
  },

  /** The usage overview, for a live admin session only. */
  async getUsageOverview(_request, handlerContext) {
    requireAdminSurface(handlerContext);
    return runUsecase(async () => {
      await adminSession.requireAdminSession(adminSessionToken(handlerContext));
      if (!rateLimitCheck("admin-usage-overview", ADMIN_READ_RATE_LIMIT)) {
        throw new ConnectError("too many requests, please try again later", Code.ResourceExhausted);
      }
      return getUsageOverview();
    }, handlerContext);
  },
};
