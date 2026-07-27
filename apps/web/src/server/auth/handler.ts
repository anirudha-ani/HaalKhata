/** Thin AuthService Connect handlers: session-cookie side effects here, logic in auth.usecase. */

import type { ServiceImpl } from "@connectrpc/connect";
import type { HandlerContext } from "@connectrpc/connect";
import type { AuthService } from "@haalkhata/protogen/auth/v1/auth_pb";
import * as auth from "@/server/auth/usecase/auth.usecase";
import * as accountMerge from "@/server/auth/usecase/accountMerge.usecase";
import { clearSessionCookie, requireUser, runUsecase, setSessionCookie } from "@/server/api/connect/context";
import { rateLimitCheck } from "@/server/common/rateLimit";
import { AUTH_RATE_LIMIT } from "@/server/auth/auth.constants";
import { ConnectError, Code } from "@connectrpc/connect";

/**
 * Extracts a best-effort client IP from request headers (x-forwarded-for
 * when behind a proxy, falling back to the connect-protocol peer).
 *
 * @param handlerContext - Connect handler context carrying request headers.
 * @returns The client IP string, or "unknown" when no IP header is present.
 */
function clientIp(handlerContext: HandlerContext): string {
  const forwarded = handlerContext.requestHeader.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return handlerContext.requestHeader.get("x-real-ip") ?? "unknown";
}

/**
 * Enforces the per-IP login/signup rate limit, throwing a ResourceExhausted
 * ConnectError when the caller has exceeded AUTH_RATE_LIMIT attempts/minute.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @throws ConnectError with Code.ResourceExhausted when rate-limited.
 */
function enforceAuthRateLimit(handlerContext: HandlerContext): void {
  if (!rateLimitCheck(`auth:${clientIp(handlerContext)}`, AUTH_RATE_LIMIT)) {
    throw new ConnectError("too many attempts, please try again later", Code.ResourceExhausted);
  }
}

/** AuthService implementation; every method delegates to auth.usecase and only manages cookies here. */
export const authHandler: ServiceImpl<typeof AuthService> = {
  /** Creates (or claims) an account, then starts a web session via cookie. */
  async signUp(request, handlerContext) {
    enforceAuthRateLimit(handlerContext);
    const result = await runUsecase(() => auth.signUp(request), handlerContext);
    setSessionCookie(handlerContext, result.token);
    return result;
  },

  /** Verifies credentials, then starts a web session via cookie. */
  async logIn(request, handlerContext) {
    enforceAuthRateLimit(handlerContext);
    const result = await runUsecase(() => auth.logIn(request), handlerContext);
    setSessionCookie(handlerContext, result.token);
    return result;
  },

  /** Verifies a Google ID token, then starts a web session via cookie. */
  async logInWithGoogle(request, handlerContext) {
    enforceAuthRateLimit(handlerContext);
    const result = await runUsecase(
      () => auth.logInWithGoogle(request.idToken),
      handlerContext,
    );
    setSessionCookie(handlerContext, result.token);
    return result;
  },

  /** Ends the web session by expiring the session cookie and revoking the token. */
  async logOut(_request, handlerContext) {
    await runUsecase(async () => auth.logOut(await requireUser(handlerContext)), handlerContext);
    clearSessionCookie(handlerContext);
    return {};
  },

  /** Returns the calling user's profile. */
  async getMe(_request, handlerContext) {
    return runUsecase(async () => auth.getMe(await requireUser(handlerContext)), handlerContext);
  },

  /** Updates the calling user's name and/or default currency. */
  async updateProfile(request, handlerContext) {
    return runUsecase(async () => auth.updateProfile(await requireUser(handlerContext), request), handlerContext);
  },

  /**
   * Claims a phone number, or reports what merging would absorb when an
   * unclaimed invitation already holds it.
   */
  async setPhone(request, handlerContext) {
    return runUsecase(
      async () => accountMerge.setPhone(await requireUser(handlerContext), request.phone),
      handlerContext,
    );
  },

  /** Carries out the merge that setPhone previewed. */
  async confirmPhoneMerge(request, handlerContext) {
    return runUsecase(
      async () =>
        accountMerge.confirmPhoneMerge(await requireUser(handlerContext), request.mergeToken),
      handlerContext,
    );
  },

  /** Marks the caller's first-run flow finished, skipped fields included. */
  async completeOnboarding(_request, handlerContext) {
    return runUsecase(
      async () => auth.completeOnboarding(await requireUser(handlerContext)),
      handlerContext,
    );
  },
};
