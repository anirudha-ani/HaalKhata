/**
 * A sign-out that could not reach the server, finished the next time it can.
 *
 * Signing out on the phone ends the session on the server (LogOut bumps the
 * account's token version, which also stops every phone's pushes). Offline,
 * that call fails: the phone forgets its token, but the server still treats
 * the session, and this phone's push registration, as live, so the signed-out
 * account's notifications keep arriving on the lock screen. The old token is
 * kept here, in the Keychain beside where the session lived, until LogOut
 * with it succeeds.
 */

import { Code, ConnectError } from "@connectrpc/connect";
import * as SecureStore from "expo-secure-store";
import { authClient } from "./connect";
import { UNFINISHED_SIGN_OUT_STORAGE_KEY } from "./api.constants";

/**
 * Keeps a session token whose sign-out did not reach the server.
 *
 * @param token - The bearer token of the session being signed out.
 */
export async function rememberUnfinishedSignOut(token: string): Promise<void> {
  await SecureStore.setItemAsync(UNFINISHED_SIGN_OUT_STORAGE_KEY, token);
}

/**
 * Whether a LogOut failure means the session is already over on the server.
 *
 * @param failure - What LogOut threw.
 * @returns True for an expired or revoked session.
 */
export function sessionAlreadyEnded(failure: unknown): boolean {
  return failure instanceof ConnectError && failure.code === Code.Unauthenticated;
}

/**
 * Ends a remembered session on the server, if there is one. Safe to call at
 * any time, signed in or out: the call carries the remembered token itself,
 * never the current session's. Kept for next time when the server still
 * cannot be reached; dropped once it answers, including "already ended".
 */
export async function finishUnfinishedSignOut(): Promise<void> {
  const token = await SecureStore.getItemAsync(UNFINISHED_SIGN_OUT_STORAGE_KEY);
  if (!token) return;
  try {
    await authClient.logOut({}, { headers: { Authorization: `Bearer ${token}` } });
  } catch (failure) {
    if (!sessionAlreadyEnded(failure)) return;
  }
  await SecureStore.deleteItemAsync(UNFINISHED_SIGN_OUT_STORAGE_KEY);
}
