/** User-facing invite wording shared by browser and native landing screens and add forms. */

import { LIVE_SPLIT_MINUTES } from "../expense/live/live.constants";
import { formatMoney } from "../money/money";
import { localDate } from "../time/localTime";
import { GROUP_INVITE_LINK_LIFETIME_DAYS } from "./invite.constants";

/** The public preview fields used to explain what accepting an invite does. */
export interface InvitePreview {
  /** "group", "profile" or "live". */
  kind: string;
  /** Person who created the link. */
  inviterName: string;
  /** Group being joined, or that a live split's expense belongs to. */
  groupName: string;
  /** Number of existing group members, or of people in a live split so far. */
  memberCount: number;
  /** Live splits only: the expense being split. */
  expenseDescription?: string;
  /** Live splits only: its total. */
  totalCents?: number;
  /** Live splits only: its currency. */
  currency?: string;
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

/** The join page's heading for a group link that has run past its date. */
export const INVITE_EXPIRED_TITLE = "This invite link has expired";

/** What the join page says under {@link INVITE_EXPIRED_TITLE}: why, and what to do. */
export const INVITE_EXPIRED_BODY =
  `Group invite links work for ${GROUP_INVITE_LINK_LIFETIME_DAYS} days. Ask someone in the group to share a new one.`;

/** The join page's heading for a live split that has finished. */
export const LIVE_SPLIT_ENDED_TITLE = "This live split has ended";

/** What the join page says under {@link LIVE_SPLIT_ENDED_TITLE}. */
export const LIVE_SPLIT_ENDED_BODY =
  `Live splits run for ${LIVE_SPLIT_MINUTES} minutes. Ask whoever started it to start another.`;

/** The join page's heading for any other link that does not work. */
export const INVITE_INACTIVE_TITLE = "This invite link isn’t active";

/**
 * What the share dialog says about a group's join link, including until when
 * it works, so whoever shares it knows a week-old message will not let anyone in.
 *
 * @param groupName - The group the link joins.
 * @param expiresAt - When the link stops working (ISO 8601); "" when unknown.
 * @param nowTime - The current time, injectable so tests stay deterministic.
 * @returns One or two sentences for the dialog.
 */
export function groupInviteExplainer(groupName: string, expiresAt: string, nowTime: Date = new Date()): string {
  const until = expiresAt ? localDate(expiresAt, nowTime) : "";
  return `Anyone who scans this or opens the link can join ${groupName}${until ? ` until ${until}` : ""}. They'll see who invited them before accepting.`;
}

/** Sign-in guidance that applies to both Google and Apple. */
export const INVITE_SIGN_IN_HINT = "New here? Signing in creates your account. You’ll return here to accept the invite.";

/** @param preview Public invite details. @returns Matching title, explanation, action and confirmation. */
export function inviteCopy(preview: InvitePreview) {
  const requestSent = `Request sent — ${preview.inviterName} will confirm from their side.`;
  if (preview.kind === "live") {
    const total = formatMoney(preview.totalCents ?? 0, preview.currency ?? "USD");
    const people = `${preview.memberCount} ${preview.memberCount === 1 ? "person" : "people"} here so far.`;
    const joinsGroup = preview.groupName ? ` Joining adds you to “${preview.groupName}”.` : "";
    return {
      title: `${preview.inviterName} is splitting “${preview.expenseDescription}” live`,
      description: `${total} · ${people} Join to edit it together.${joinsGroup}`,
      action: "Join the split",
      requestSent,
    };
  }
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
