/** The link to an invite on this instance. */

import { inviteUrl } from "@haalkhata/shared/invite/invite";

/**
 * Builds an invite's link from the address this page was opened at, which is
 * by definition an address of the server that minted the invite.
 *
 * @param token - The invite's token.
 * @returns The link to share.
 */
export function shareableInviteUrl(token: string): string {
  return inviteUrl(token, window.location.origin);
}
