/**
 * Thin AdminAnalyticsService Connect handlers: the surface and origin checks
 * (api/connect/adminRequest.ts), the admin cookie and the rate limits live
 * here; the logic is in the usecases.
 */

import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import type { AdminAnalyticsService } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { adminSessionToken, requireAdminPageRequest } from "@/server/api/connect/admin/adminRequest";
import { sessionCookieAttributes } from "@/server/api/connect/connect.constants";
import { runUsecase } from "@/server/api/connect/context";
import { clientIp } from "@/server/auth/request/clientIp";
import { rateLimitCheck } from "@/server/common/rateLimit/rateLimit";
import {
  ADMIN_AUTH_RATE_LIMIT,
  ADMIN_NONCE_RATE_LIMIT,
  ADMIN_READ_RATE_LIMIT,
  ADMIN_SESSION_COOKIE_POLICY,
  ADMIN_SESSION_LIFETIME_SECONDS,
  ADMIN_TREND_RATE_LIMIT,
} from "@/server/adminanalytics/adminanalytics.constants";
import * as adminSession from "@/server/adminanalytics/usecase/adminSession.usecase";
import { getUsageOverview } from "@/server/adminanalytics/usecase/usage.usecase";
import { getUsageTrend } from "@/server/adminanalytics/usecase/usageTrend.usecase";

/**
 * Enforces one of the per-address sign-in limits.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @param bucket - Which limit: "admin-nonce" for issuing a nonce,
 *   "admin-auth" for exchanging a Google token.
 * @param limit - Requests that bucket accepts per address per minute.
 * @throws ConnectError with Code.ResourceExhausted when rate-limited.
 */
function enforceAdminAuthRateLimit(
  handlerContext: HandlerContext,
  bucket: "admin-nonce" | "admin-auth",
  limit: number,
): void {
  if (!rateLimitCheck(`${bucket}:${clientIp(handlerContext.requestHeader)}`, limit)) {
    throw new ConnectError("too many attempts, please try again later", Code.ResourceExhausted);
  }
}

/** AdminAnalyticsService implementation. Every method starts by confirming the surface and the origin. */
export const adminAnalyticsHandler: ServiceImpl<typeof AdminAnalyticsService> = {
  /** Issues the nonce for an admin sign-in. */
  async beginSignIn(_request, handlerContext) {
    requireAdminPageRequest(handlerContext);
    enforceAdminAuthRateLimit(handlerContext, "admin-nonce", ADMIN_NONCE_RATE_LIMIT);
    return runUsecase(() => adminSession.beginAdminSignIn(), handlerContext);
  },

  /** Verifies the Google identity and, for an allowlisted address, sets the admin cookie. */
  async signIn(request, handlerContext) {
    requireAdminPageRequest(handlerContext);
    enforceAdminAuthRateLimit(handlerContext, "admin-auth", ADMIN_AUTH_RATE_LIMIT);
    const { token } = await runUsecase(
      () => adminSession.signInAdmin(request.idToken),
      handlerContext,
    );
    handlerContext.responseHeader.append(
      "set-cookie",
      sessionCookieAttributes(token, ADMIN_SESSION_LIFETIME_SECONDS, ADMIN_SESSION_COOKIE_POLICY),
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
    handlerContext.responseHeader.append(
      "set-cookie",
      sessionCookieAttributes("", 0, ADMIN_SESSION_COOKIE_POLICY),
    );
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

  /** One window of the trend, for a live admin session only. */
  async getUsageTrend(request, handlerContext) {
    requireAdminPageRequest(handlerContext);
    return runUsecase(async () => {
      await adminSession.requireAdminSession(adminSessionToken(handlerContext));
      if (!rateLimitCheck("admin-usage-trend", ADMIN_TREND_RATE_LIMIT)) {
        throw new ConnectError("too many requests, please try again later", Code.ResourceExhausted);
      }
      return getUsageTrend({ unit: request.unit, endOn: request.endOn });
    }, handlerContext);
  },
};
