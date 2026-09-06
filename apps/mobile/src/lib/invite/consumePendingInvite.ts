/** Completes a stashed invite right after sign-in, returning where to land. */

import { socialClient } from "@/lib/api/connect";
import { takePendingInvite } from "./pendingInvite";

/**
 * Accepts the invite a signed-out person arrived with, if one is waiting.
 *
 * @returns The route to land on: the joined group, the friends tab after a
 *   personal invite, or the dashboard when nothing was pending (or the
 *   accept failed — the person is signed in either way, and the link can be
 *   tapped again for the real error).
 */
export async function consumePendingInvite(): Promise<string> {
  const token = await takePendingInvite();
  if (!token) return "/dashboard";
  try {
    const result = await socialClient.acceptInviteLink({ token });
    return result.groupId ? `/groups/${result.groupId}` : "/friends";
  } catch {
    return "/dashboard";
  }
}
