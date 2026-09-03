"use client";
/** Hands an invite link to the OS share sheet, falling back to the clipboard. */

import { inviteShareMessage, inviteUrl, profileShareMessage } from "@haalkhata/shared/invite/invite";

/** How the link left the device, for the confirmation the UI shows. */
export type ShareOutcome = "shared" | "copied";

/**
 * Shares an invite link the way the platform allows: the native share sheet
 * where the browser has one (phones, mostly), otherwise the clipboard. Both
 * are user gestures on a button, so no permission prompts appear.
 *
 * @param token - The invite token minted by the server.
 * @param inviterName - Whoever is sharing, for the message text.
 * @param groupName - The group's name for a join link; empty for a personal invite.
 * @returns How the link left, so the button can confirm honestly.
 * @throws The share sheet's rejection when the person cancels it — callers
 *   treat a cancel as "no confirmation", not an error.
 */
export async function shareInvite(
  token: string,
  inviterName: string,
  groupName: string,
): Promise<ShareOutcome> {
  const linkUrl = inviteUrl(token);
  const text = inviteShareMessage(inviterName, groupName);
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    await navigator.share({ title: "HaalKhata", text, url: linkUrl });
    return "shared";
  }
  await navigator.clipboard.writeText(`${text} ${linkUrl}`);
  return "copied";
}

/**
 * Shares the caller's own profile link, with its "add me" wording.
 *
 * @param token - The profile link's token.
 * @param name - The profile owner's display name.
 * @returns How the link left, so the button can confirm honestly.
 */
export async function shareProfileInvite(token: string, name: string): Promise<ShareOutcome> {
  const linkUrl = inviteUrl(token);
  const text = profileShareMessage(name);
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    await navigator.share({ title: "HaalKhata", text, url: linkUrl });
    return "shared";
  }
  await navigator.clipboard.writeText(`${text} ${linkUrl}`);
  return "copied";
}
