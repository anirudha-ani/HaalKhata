/** Thin AuthService Connect handlers: session-cookie side effects here, logic in auth.usecase. */

import type { ServiceImpl } from "@connectrpc/connect";
import type { HandlerContext } from "@connectrpc/connect";
import type { AuthService } from "@haalkhata/protogen/auth/v1/auth_pb";
import * as auth from "@/server/auth/usecase/auth.usecase";
import * as accountMerge from "@/server/auth/usecase/accountMerge.usecase";
import { clearSessionCookie, requireUser, runUsecase, setSessionCookie } from "@/server/api/connect/context";
import { wantsBearerToken } from "@/server/api/connect/credentials";
import { rateLimitCheck } from "@/server/common/rateLimit";
import {
  AUTH_RATE_LIMIT,
  normalizePhone,
  PHONE_CHECK_RATE_LIMIT,
  PHONE_MERGE_RATE_LIMIT,
  PHONE_SEND_RATE_LIMIT,
} from "@/server/auth/auth.constants";
import { ConnectError, Code } from "@connectrpc/connect";
import { clientIp } from "@/server/auth/clientIp";
import { enforcePhoneSendLimits } from "@/server/auth/phoneRateLimit";

/**
 * Enforces the per-IP login/signup rate limit, throwing a ResourceExhausted
 * ConnectError when the caller has exceeded AUTH_RATE_LIMIT attempts/minute.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @throws ConnectError with Code.ResourceExhausted when rate-limited.
 */
function enforceAuthRateLimit(handlerContext: HandlerContext): void {
  if (!rateLimitCheck(`auth:${clientIp(handlerContext.requestHeader)}`, AUTH_RATE_LIMIT)) {
    throw new ConnectError("too many attempts, please try again later", Code.ResourceExhausted);
  }
}

/**
 * Enforces one per-account phone bucket. Sends, checks, and merge actions
 * each pace separately so a fumbled code cannot lock the user out of the
 * confirmation; the durable anti-abuse ceilings live in Postgres.
 *
 * @param userId - Authenticated caller.
 * @param scope - Which phone operation is being paced.
 * @param maxAttempts - Calls accepted in the rolling minute.
 * @throws ConnectError with Code.ResourceExhausted when rate-limited.
 */
function enforcePhoneRateLimit(
  userId: string,
  scope: "send" | "check" | "merge",
  maxAttempts: number,
): void {
  if (!rateLimitCheck(`phone:${scope}:${userId}`, maxAttempts)) {
    throw new ConnectError("too many verification attempts, please try again later", Code.ResourceExhausted);
  }
}

/**
 * Hands a freshly issued session to the client the way it carries sessions:
 * as a bearer token in the body for a client that asked for one (mobile),
 * otherwise as the HttpOnly cookie and nothing readable in the body. A
 * browser must never receive bearer material — the cookie is HttpOnly so
 * script cannot read the session, and a token in the JSON would hand it to
 * any script running during sign-in.
 *
 * @param handlerContext - Connect handler context for the current request.
 * @param result - The usecase's response, including the token.
 * @returns The response to send.
 */
function deliverSession<Result extends { token: string }>(
  handlerContext: HandlerContext,
  result: Result,
): Result {
  if (wantsBearerToken(handlerContext.requestHeader)) return result;
  setSessionCookie(handlerContext, result.token);
  return { ...result, token: "" };
}

/** AuthService implementation; every method delegates to auth.usecase and only manages cookies here. */
export const authHandler: ServiceImpl<typeof AuthService> = {
  /** Creates (or claims) an account, then starts a session the way the client carries it. */
  async signUp(request, handlerContext) {
    enforceAuthRateLimit(handlerContext);
    return deliverSession(handlerContext, await runUsecase(() => auth.signUp(request), handlerContext));
  },

  /** Verifies credentials, then starts a session the way the client carries it. */
  async logIn(request, handlerContext) {
    enforceAuthRateLimit(handlerContext);
    return deliverSession(handlerContext, await runUsecase(() => auth.logIn(request), handlerContext));
  },

  /** Creates a short-lived, single-use nonce for a Google ID-token request. */
  async beginGoogleSignIn(_request, handlerContext) {
    enforceAuthRateLimit(handlerContext);
    return runUsecase(() => auth.beginGoogleSignIn(), handlerContext);
  },

  /** Verifies a Google ID token, then starts a session the way the client carries it. */
  async logInWithGoogle(request, handlerContext) {
    enforceAuthRateLimit(handlerContext);
    return deliverSession(
      handlerContext,
      await runUsecase(() => auth.logInWithGoogle(request.idToken), handlerContext),
    );
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
    const userId = await requireUser(handlerContext);
    // Inside runUsecase so the durable limiter's own database errors are
    // sanitized like any other; its ConnectError refusals pass through.
    return runUsecase(async () => {
      if (request.verificationCode === "") {
        // A call without a code is the one that sends an SMS; it is also
        // limited by destination and by client address, whoever the account
        // is — durably, in Postgres.
        enforcePhoneRateLimit(userId, "send", PHONE_SEND_RATE_LIMIT);
        await enforcePhoneSendLimits(
          normalizePhone(request.phone) ?? request.phone.trim(),
          clientIp(handlerContext.requestHeader),
        );
      } else {
        enforcePhoneRateLimit(userId, "check", PHONE_CHECK_RATE_LIMIT);
      }
      return accountMerge.setPhone(userId, request.phone, request.verificationCode);
    }, handlerContext);
  },

  /** Carries out the merge that setPhone previewed. */
  async confirmPhoneMerge(request, handlerContext) {
    const userId = await requireUser(handlerContext);
    enforcePhoneRateLimit(userId, "merge", PHONE_MERGE_RATE_LIMIT);
    return runUsecase(
      async () => accountMerge.confirmPhoneMerge(userId, request.mergeToken),
      handlerContext,
    );
  },

  /** Detaches the caller's phone number; refused when it is their only identifier. */
  async removePhone(_request, handlerContext) {
    const userId = await requireUser(handlerContext);
    enforcePhoneRateLimit(userId, "merge", PHONE_MERGE_RATE_LIMIT);
    return runUsecase(async () => auth.removePhone(userId), handlerContext);
  },

  /** Marks the caller's first-run flow finished, skipped fields included. */
  async completeOnboarding(_request, handlerContext) {
    return runUsecase(
      async () => auth.completeOnboarding(await requireUser(handlerContext)),
      handlerContext,
    );
  },
};
