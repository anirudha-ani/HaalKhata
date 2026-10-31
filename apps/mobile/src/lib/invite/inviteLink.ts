/** The link to an invite on the server this app talks to. */

import { inviteUrl } from "@haalkhata/shared/invite/invite";
import { resolveApiBaseUrl } from "@/lib/api/api.constants";

/**
 * Builds an invite's link from the server this build talks to: its one
 * address, required and HTTPS in a release build.
 *
 * @param token - The invite's token.
 * @returns The link to share.
 */
export function shareableInviteUrl(token: string): string {
  return inviteUrl(token, new URL(resolveApiBaseUrl()).origin);
}
