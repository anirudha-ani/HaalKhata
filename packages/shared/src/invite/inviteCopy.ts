/** User-facing invite wording shared by browser and native landing screens and add forms. */

/** The public preview fields used to explain what accepting an invite does. */
export interface InvitePreview {
  /** "group" or "profile". */
  kind: string;
  /** Person who created the link. */
  inviterName: string;
  /** Group being joined, when applicable. */
  groupName: string;
  /** Number of existing group members. */
  memberCount: number;
}

/**
 * What an add form says when the email or phone typed belongs to nobody on
 * HaalKhata, and the link it offers instead. Nothing is made for that
 * person: they sign up through the link and arrive as themselves.
 */
export const NOT_ON_HAALKHATA_COPY = {
  /** Adding a friend: the caller's own profile link. */
  friend: {
    message: "They’re not on HaalKhata yet. Send them your invite link — once they sign up, you’ll get a friend request to confirm.",
    action: "Share your invite link",
  },
  /** Adding to a group: the group's join link. */
  group: {
    message: "They’re not on HaalKhata yet. Send them this group’s invite link — once they sign up, they join the group.",
    action: "Share the group’s invite link",
  },
} as const;

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
  // A profile link, the only other kind there is.
  return {
    title: `${preview.inviterName} wants to connect on HaalKhata`,
    description: "Accepting sends them a friend request; you'll be connected once they confirm.",
    action: "Send friend request",
    requestSent,
  };
}
