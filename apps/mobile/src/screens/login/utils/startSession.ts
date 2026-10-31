/** What every sign-in path does with a fresh session token before leaving the welcome screen. */

import { clearMobileQueryCache } from "@/lib/api/queryCache";
import { setSessionToken } from "@/lib/api/session";
import { markDeviceSetupDue } from "@/lib/onboarding/deviceSetup";
import { clearPushTraces } from "@/lib/push/pushStore";

/**
 * Starts a session the same way for Apple, Google and the development
 * password form. It drops whatever a previous session left in the cache and
 * in the push state (its banners, its badge, and the record of a recent
 * registration, so this session registers the phone straight away even if
 * the last one was signed out by the server), notes that someone just signed
 * in on this phone (so the first-run flow offers its device steps once), and
 * stores the token. Where to go next is not decided here: the welcome screen
 * leaves for a pending invitation or Home as soon as a session exists
 * (useLeaveWhenSignedIn), whether it was started here or was already there.
 *
 * @param token - The bearer token the server returned.
 */
export async function startSession(token: string): Promise<void> {
  await clearMobileQueryCache();
  await clearPushTraces();
  await markDeviceSetupDue();
  await setSessionToken(token);
}
