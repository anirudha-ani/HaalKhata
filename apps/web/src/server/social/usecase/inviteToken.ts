/** The bearer token every invite link is made with. */

import { randomBytes } from "node:crypto";
import { INVITE_LINK_TOKEN_BYTES } from "@/server/social/social.constants";

/**
 * Mints a fresh bearer token for an invite link.
 *
 * @returns The token.
 */
export function newInviteToken(): string {
  return randomBytes(INVITE_LINK_TOKEN_BYTES).toString("base64url");
}
