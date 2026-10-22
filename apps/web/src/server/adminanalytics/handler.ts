/**
 * Thin AdminAnalyticsService Connect handlers: the surface and origin checks
 * (api/connect/adminRequest.ts), the admin cookie and the rate limits live
 * here; the logic is in the usecases.
 */

import { Code, ConnectError, type HandlerContext, type ServiceImpl } from "@connectrpc/connect";
import type { AdminAnalyticsService } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { adminSessionToken, requireAdminPageRequest } from "@/server/api/connect/adminRequest";
import { runUsecase } from "@/server/api/connect/context";
import { clientIp } from "@/server/auth/request/clientIp";
import { rateLimitCheck } from "@/server/common/rateLimit/rateLimit";
import {
  ADMIN_AUTH_RATE_LIMIT,
  ADMIN_READ_RATE_LIMIT,
  ADMIN_SESSION_LIFETIME_SECONDS,
  adminSessionCookieAttributes,
} from "@/server/adminanalytics/adminanalytics.constants";
import * as adminSession from "@/server/adminanalytics/usecase/adminSession.usecase";
import { getUsageOverview } from "@/server/adminanalytics/usecase/usage.usecase";

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
