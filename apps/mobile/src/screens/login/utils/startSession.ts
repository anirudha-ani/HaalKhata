/** What every sign-in path does with a fresh session token before leaving the welcome screen. */

import { clearMobileQueryCache } from "@/lib/api/queryCache";
import { setSessionToken } from "@/lib/api/session";
import { consumePendingInvite } from "@/lib/invite/consumePendingInvite";
import { markDeviceSetupDue } from "@/lib/onboarding/deviceSetup";

/**
 * Starts a session the same way for Apple, Google and the development
 * password form. It drops whatever a previous account left in the cache,
 * notes that someone just signed in on this phone (so the first-run flow
 * offers its device steps once), stores the token, and resumes a pending
 * invitation if there is one.
 *
 * @param token - The bearer token the server returned.
 * @returns Where to go next: the invitation, or Home.
 */
export async function startSession(token: string): Promise<string> {
  await clearMobileQueryCache();
  await markDeviceSetupDue();
  await setSessionToken(token);
  return consumePendingInvite();
}
