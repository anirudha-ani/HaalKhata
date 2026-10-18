/**
 * Wording for finding friends from contacts and for the discoverability
 * choice, shared by both apps and, for the request title, by the server.
 */

import { ContactRelation } from "@haalkhata/protogen/social/v1/social_pb";

/**
 * Title of the notification a friend request sends. The server writes it and
 * the confirm sheet previews it, so App Review's "show how the message will
 * appear" (5.1.2(v)) is the message itself, not a paraphrase.
 *
 * @param senderName - Display name of the person sending the request.
 * @returns The notification title the recipient sees.
 */
export function friendRequestTitle(senderName: string): string {
  return `${senderName} sent you a friend request`;
}

/**
 * The line above the people found, saying what Add sends and quoting the
 * notification the person receives. App Review asks that the sender see how
 * a message to someone found through contacts will appear before it goes
 * (5.1.2(v)); each Add sends one request, so the line covers every row.
 *
 * @param senderName - The caller's display name.
 * @returns The line.
 */
export function addRequestPreview(senderName: string): string {
  return `Add sends one friend request. They see “${friendRequestTitle(senderName)}”.`;
}

/** Shown before the operating system's contacts prompt. */
export const CONTACTS_EXPLANATION = {
  title: "Find friends from your contacts",
  body:
    "HaalKhata checks the phone numbers and emails in your contacts to show who already uses it. " +
    "People who turned off being found never appear. Names stay on this phone, and nothing is stored.",
  action: "Continue",
} as const;

/** Shown when contacts access was refused. */
export const CONTACTS_DENIED = {
  title: "Contacts access is off",
  body: "To find friends from your contacts, allow HaalKhata to read them in Settings.",
  action: "Open Settings",
} as const;

/** Shown above the results when only some contacts were shared. */
export const CONTACTS_LIMITED = {
  body: "You shared some of your contacts. Choose more to find more friends.",
  action: "Choose more contacts",
} as const;

/** Shown when no contact is on HaalKhata yet. */
export const CONTACTS_NO_MATCHES = {
  title: "None of your contacts are on HaalKhata yet",
  body: "Invite someone with your link, or add them by email or phone from Friends.",
} as const;

/** Titles of the Find friends screen and its sections, in the order they appear. */
export const FIND_FRIENDS_COPY = {
  title: "Find friends",
  entry: "Find friends from contacts",
  reading: "Reading your contacts…",
  incoming: "Wants to be your friend",
  requestable: "On HaalKhata",
  requested: "Requested",
  friends: "Already friends",
  shareLink: "Share my invite link",
} as const;

/** The discoverability setting, in onboarding and under Account. */
export const CONTACT_DISCOVERY_SETTING = {
  label: "Let people find me from their contacts",
  detail:
    "People who have your verified phone number or email saved can see that you use HaalKhata " +
    "and send you a friend request. They see your name and photo, never your number or email.",
  findableNotice: "People who have your number or email saved can now find you.",
  hiddenNotice: "People can no longer find you from their contacts.",
} as const;

/**
 * The one-time notice for accounts that never answered. Being findable is
 * the default, so this says what is already true and offers the way out at
 * the same size as the way to keep it.
 */
export const CONTACT_DISCOVERY_PROMPT = {
  title: "Friends can find you",
  body: CONTACT_DISCOVERY_SETTING.detail,
  allow: "Keep it on",
  decline: "Turn off",
  allowedNotice:
    "Friends who have your number or email saved can find you. You can change this under Account.",
  declinedNotice:
    "People won't find you from their contacts. You can change this under Account.",
} as const;

/**
 * The line under a found person's saved name when their account name differs.
 *
 * @param accountName - The name on their HaalKhata account.
 * @returns The line shown under the saved name.
 */
export function onHaalKhataAs(accountName: string): string {
  return `On HaalKhata as ${accountName}`;
}

/**
 * The button on a found person's row.
 *
 * @param relation - Where the caller stands with them.
 * @returns The row's action or state label.
 */
export function relationAction(relation: ContactRelation): string {
  switch (relation) {
    case ContactRelation.REQUESTED:
      return "Requested";
    case ContactRelation.INCOMING:
      return "Accept";
    case ContactRelation.FRIEND:
      return "Friends";
    default:
      return "Add";
  }
}

/**
 * Formats a count the way the app writes numbers ("1,240").
 *
 * @param count - Any whole number.
 * @returns The grouped number.
 */
function grouped(count: number): string {
  return count.toLocaleString("en-US");
}

/**
 * Progress line while contacts are read and matched.
 *
 * @param count - Contacts being checked.
 * @returns The line shown under the spinner.
 */
export function checkingLabel(count: number): string {
  return count === 1 ? "Checking 1 contact…" : `Checking ${grouped(count)} contacts…`;
}

/**
 * Said when the day's allowance ran out part-way through a large address book.
 *
 * @param checked - Identifiers matched before the allowance ran out.
 * @param total - Identifiers in the whole address book.
 * @returns A sentence saying what was and was not checked.
 */
export function partialCheckMessage(checked: number, total: number): string {
  return `Checked ${grouped(checked)} of ${grouped(total)} phone numbers and emails. The rest can be checked tomorrow.`;
}
