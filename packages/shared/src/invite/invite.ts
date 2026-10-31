/** The one spelling of an invite link's URL, shared by both apps' share sheets. */

/**
 * Composes the shareable URL for an invite token. The origin comes from the
 * app, because a token only means something on the server that minted it: a
 * staging or self-hosted instance's link must lead back to that instance.
 *
 * @param token - The bearer token minted by the server.
 * @param origin - The address of the server that minted it.
 * @returns The absolute URL the join page answers at.
 */
export function inviteUrl(token: string, origin: string): string {
  return `${origin}/join/${token}`;
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

/**
 * The message beside a shared live split, written for whoever is at the table.
 *
 * @param inviterName - Whoever is sharing.
 * @param description - The expense being split.
 * @returns One sentence saying what the link is for.
 */
export function liveSplitShareMessage(inviterName: string, description: string): string {
  return `${inviterName} is splitting "${description}" on HaalKhata. Tap to claim what you had.`;
}
