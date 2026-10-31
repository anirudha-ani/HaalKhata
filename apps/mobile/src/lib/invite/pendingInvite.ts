/** A join-link token waiting for sign-in, so a cold-start deep link survives the login detour — briefly, and for this phone's next sign-in only. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  LEGACY_PENDING_INVITE_STORAGE_KEY,
  PENDING_INVITE_LIFETIME_MS,
  PENDING_INVITE_STORAGE_KEY,
} from "./constants/pendingInvite";

/** What is saved: the token, and when, so a forgotten one can be told apart from one being signed in for. */
interface StashedInvite {
  /** The invite token from the deep link. */
  token: string;
  /** When it was saved, in milliseconds since the epoch. */
  stashedAt: number;
}

/**
 * Stashes the token a signed-out person arrived with; the login flow
 * consumes it right after a session exists.
 *
 * @param token - The invite token from the deep link.
 */
export async function stashPendingInvite(token: string): Promise<void> {
  const stashed: StashedInvite = { token, stashedAt: Date.now() };
  await AsyncStorage.setItem(PENDING_INVITE_STORAGE_KEY, JSON.stringify(stashed));
}

/**
 * Reads a saved entry, accepting only the shape {@link stashPendingInvite}
 * writes.
 *
 * @param stored - The raw stored text, or null when nothing is saved.
 * @returns The saved invite, or null when there is none or it cannot be read.
 */
function readStash(stored: string | null): StashedInvite | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<StashedInvite> | null;
    if (typeof parsed?.token === "string" && parsed.token !== "" && typeof parsed.stashedAt === "number") {
      return { token: parsed.token, stashedAt: parsed.stashedAt };
    }
  } catch {
    // Not something this version wrote; treated as nothing saved.
  }
  return null;
}

/**
 * Takes the stashed token, clearing it — accepting is one-shot, and a stale
 * token must not re-fire on the next login. One saved more than
 * {@link PENDING_INVITE_LIFETIME_MS} ago is dropped: the person who saved it
 * did not sign in, and whoever is signing in now may be somebody else.
 *
 * @returns The token, or null when none is waiting or it is too old.
 */
export async function takePendingInvite(): Promise<string | null> {
  const stashed = readStash(await AsyncStorage.getItem(PENDING_INVITE_STORAGE_KEY));
  await clearPendingInvite();
  if (!stashed) return null;
  const ageMs = Date.now() - stashed.stashedAt;
  return ageMs >= 0 && ageMs <= PENDING_INVITE_LIFETIME_MS ? stashed.token : null;
}

/**
 * Drops any saved invite, including one an earlier version saved with no
 * time on it. Signing out does this: the next person to sign in on this
 * phone is not necessarily who saved it.
 */
export async function clearPendingInvite(): Promise<void> {
  await AsyncStorage.multiRemove([PENDING_INVITE_STORAGE_KEY, LEGACY_PENDING_INVITE_STORAGE_KEY]);
}
