/** Hands an invite link to the native share sheet. */

import { Share } from "react-native";
import { inviteShareMessage, inviteUrl, profileShareMessage } from "@haalkhata/shared/invite/invite";

/** How the link left the device, for the confirmation the UI shows. */
export type ShareOutcome = "shared" | "dismissed";

/**
 * Opens the OS share sheet with an invite link and its message.
 *
 * @param token - The invite token minted by the server.
 * @param inviterName - Whoever is sharing, for the message text.
 * @param groupName - The group's name for a join link; empty for a personal invite.
 * @returns Whether the person actually shared or closed the sheet — a close
 *   is a decision, not an error, and gets no confirmation toast.
 */
export async function shareInvite(
  token: string,
  inviterName: string,
  groupName: string,
): Promise<ShareOutcome> {
  const linkUrl = inviteUrl(token);
  const result = await Share.share(
    { message: `${inviteShareMessage(inviterName, groupName)} ${linkUrl}`, url: linkUrl },
    { dialogTitle: "Invite to HaalKhata" },
  );
  return result.action === Share.dismissedAction ? "dismissed" : "shared";
}

/**
 * Shares the caller's own profile link, with its "add me" wording.
 *
 * @param token - The profile link's token.
 * @param name - The profile owner's display name.
 * @returns Whether the person actually shared or closed the sheet.
 */
export async function shareProfileInvite(token: string, name: string): Promise<ShareOutcome> {
  const linkUrl = inviteUrl(token);
  const result = await Share.share(
    { message: `${profileShareMessage(name)} ${linkUrl}`, url: linkUrl },
    { dialogTitle: "Share your profile" },
  );
  return result.action === Share.dismissedAction ? "dismissed" : "shared";
}
