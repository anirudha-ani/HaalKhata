/** Return to the pending invitation after sign-in so acceptance and failures stay visible. */

import { takePendingInvite } from "./pendingInvite";

/**
 * Matches the browser login redirect: sign-in resumes the public preview,
 * where the person explicitly accepts and sees the result. Automatically
 * accepting here used to hide failures and skip profile-request confirmation.
 *
 * @returns The pending invite screen, or Home when there is no invitation.
 */
export async function consumePendingInvite(): Promise<string> {
  const token = await takePendingInvite();
  return token ? `/join/${encodeURIComponent(token)}` : "/dashboard";
}
