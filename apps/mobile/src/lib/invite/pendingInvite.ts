/** A join-link token waiting for sign-in, so a cold-start deep link survives the login detour. */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_INVITE_KEY = "haalkhata.pendingInviteToken";

/**
 * Stashes the token a signed-out person arrived with; the login flow
 * consumes it right after a session exists.
 *
 * @param token - The invite token from the deep link.
 */
export async function stashPendingInvite(token: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, token);
}

/**
 * Takes the stashed token, clearing it — accepting is one-shot, and a stale
 * token must not re-fire on the next login.
 *
 * @returns The token, or null when none is waiting.
 */
export async function takePendingInvite(): Promise<string | null> {
  const token = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  if (token) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  return token;
}
