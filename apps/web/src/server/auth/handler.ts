/** Thin AuthService Connect handlers: session-cookie side effects here, logic in auth.usecase. */

import type { ServiceImpl } from "@connectrpc/connect";
import type { AuthService } from "@haalkhata/protogen/auth/v1/auth_pb";
import * as auth from "@/server/auth/usecase/auth.usecase";
import { clearSessionCookie, requireUser, runUsecase, setSessionCookie } from "@/server/api/connect/context";

/** AuthService implementation; every method delegates to auth.usecase and only manages cookies here. */
export const authHandler: ServiceImpl<typeof AuthService> = {
  /** Creates (or claims) an account, then starts a web session via cookie. */
  async signUp(request, handlerContext) {
    const result = await runUsecase(() => auth.signUp(request));
    setSessionCookie(handlerContext, result.token);
    return result;
  },

  /** Verifies credentials, then starts a web session via cookie. */
  async logIn(request, handlerContext) {
    const result = await runUsecase(() => auth.logIn(request));
    setSessionCookie(handlerContext, result.token);
    return result;
  },

  /** Ends the web session by expiring the session cookie. */
  async logOut(_request, handlerContext) {
    clearSessionCookie(handlerContext);
    return {};
  },

  /** Returns the calling user's profile. */
  async getMe(_request, handlerContext) {
    return runUsecase(() => auth.getMe(requireUser(handlerContext)));
  },

  /** Updates the calling user's name and/or default currency. */
  async updateProfile(request, handlerContext) {
    return runUsecase(() => auth.updateProfile(requireUser(handlerContext), request));
  },
};
