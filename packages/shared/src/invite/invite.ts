/** The one spelling of an invite link's URL, shared by both apps' share sheets. */

/**
 * Canonical public origin invite links are shared under. Fixed rather than
 * derived from the current window: a link pasted into WhatsApp must work for
 * someone who has never seen the app, whichever machine it was copied on.
 */
export const INVITE_ORIGIN = "https://haalkhata.app";

/**
 * Composes the shareable URL for an invite token.
 *
 * @param token - The bearer token minted by the server.
 * @returns The absolute URL the join page answers at.
 */
export function inviteUrl(token: string): string {
  return `${INVITE_ORIGIN}/join/${token}`;
}

/**
 * The message that travels with a shared link — written for the recipient,
 * who may have never heard of the app.
 *
 * @param inviterName - Whoever is sharing.
 * @param groupName - Set for a group link; empty for a personal invite.
 * @returns One sentence plus the URL's purpose, without the URL (share
 *   sheets carry the URL separately).
 */
export function inviteShareMessage(inviterName: string, groupName: string): string {
  return groupName
    ? `${inviterName} invited you to "${groupName}" on HaalKhata — split expenses and settle up without the spreadsheet.`
    : `${inviterName} invited you to HaalKhata — split expenses and settle up without the spreadsheet.`;
}

/**
 * The message beside a shared profile link, written for its reader.
 *
 * @param name - The profile owner's display name.
 * @returns One sentence inviting the reader to connect.
 */
export function profileShareMessage(name: string): string {
  return `Add ${name} on HaalKhata — split expenses and settle up without the spreadsheet.`;
}
