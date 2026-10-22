/** User-facing invite wording shared by browser and native landing screens. */

/** The public preview fields used to explain what accepting an invite does. */
export interface InvitePreview {
  /** Group, profile or a named-person invitation. */
  kind: string;
  /** Person who created the link. */
  inviterName: string;
  /** Group being joined, when applicable. */
  groupName: string;
  /** Number of existing group members. */
  memberCount: number;
  /** Placeholder identity claimed by a named-person invitation. */
  invitedName: string;
}

/** Sign-in guidance that applies to both Google and Apple. */
export const INVITE_SIGN_IN_HINT = "New here? Signing in creates your account. You’ll return here to accept the invite.";

/** @param preview Public invite details. @returns Matching title, explanation, action and confirmation. */
export function inviteCopy(preview: InvitePreview) {
  const requestSent = `Request sent — ${preview.inviterName} will confirm from their side.`;
  if (preview.kind === "group") {
    return {
      title: `${preview.inviterName} invited you to “${preview.groupName}”`,
      description: `A shared expense group with ${preview.memberCount} ${preview.memberCount === 1 ? "member" : "members"}. Accepting adds you to it.`,
      action: "Join the group",
      requestSent,
    };
  }
  if (preview.kind === "profile") {
    return {
      title: `${preview.inviterName} wants to connect on HaalKhata`,
      description: "Accepting sends them a friend request; you'll be connected once they confirm.",
      action: "Send friend request",
      requestSent,
    };
  }
  return {
    title: `${preview.inviterName} invited you to HaalKhata`,
    description: `They added you as “${preview.invitedName}”. Accepting brings that invitation — friendships and any group seats — onto your account.`,
    action: "Accept the invite",
    requestSent,
  };
}
