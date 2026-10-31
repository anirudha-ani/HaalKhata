/** Notices the server refusing this browser's session, from any call. */

import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { noticeSessionEnded } from "@/lib/auth/signOut";

/**
 * Hands on a refused session and rethrows. The app's own layout check only
 * runs on a full page load, so a session ended elsewhere (signed out on a
 * phone, or expired) would otherwise leave the ledger on screen with every
 * call failing. Inside the app only the session can be refused: the provider
 * proofs that also answer Unauthenticated belong to signing in.
 *
 * @param next - The rest of the call.
 * @returns The call's response.
 */
export const sessionWatch: Interceptor = (next) => async (request) => {
  try {
    return await next(request);
  } catch (failure) {
    if (failure instanceof ConnectError && failure.code === Code.Unauthenticated) noticeSessionEnded();
    throw failure;
  }
};
