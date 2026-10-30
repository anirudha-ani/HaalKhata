/** Social domain constants. */

import { GROUP_INVITE_LINK_LIFETIME_DAYS } from "@haalkhata/shared/invite/invite.constants";

/**
 * How long before the same person can be reminded about the same debt again.
 * A nudge is welcome; a stream of them is harassment, and the sender is not
 * the one who experiences the difference — so the limit is enforced here
 * rather than left to the UI.
 */
export const REMINDER_COOLDOWN_HOURS = 24;

/** Random bytes in an invite-link token; 32 encode to 43 base64url chars. */
export const INVITE_LINK_TOKEN_BYTES = 32;

/** Base64url shape of a token produced from {@link INVITE_LINK_TOKEN_BYTES}. */
export const INVITE_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** One generic sentence for every unusable token: missing, revoked, malformed. */
export const DEAD_LINK_MESSAGE = "that invite link isn't valid or was turned off";

/** What anyone opening or accepting a group link past its date is told. */
export const EXPIRED_LINK_MESSAGE =
  `this invite link has expired — group invite links stop working after ${GROUP_INVITE_LINK_LIFETIME_DAYS} days, so ask someone in the group to share a new one`;

/**
 * Unauthenticated invite-link previews allowed per client address per
 * minute. The token itself is the credential; this just keeps the endpoint
 * from being a scanning surface.
 */
export const INVITE_PREVIEW_RATE_LIMIT = 30;

/**
 * Social calls that need no session: the invite preview a signed-out visitor
 * sees, and two retired invite calls that only refuse. Every other social
 * call's request gate asks for a session.
 */
export const ANONYMOUS_SOCIAL_RPCS: ReadonlySet<string> = new Set([
  "PreviewInviteLink",
  "GetFriendInviteLink",
  "InviteContactToSignUp",
]);

/**
 * AddFriend's refusal for an email or phone that belongs to nobody on
 * HaalKhata. The clients answer it with the caller's own invite link.
 */
export const NOT_ON_HAALKHATA_MESSAGE =
  "they're not on HaalKhata yet — share your invite link so they can sign up";

/**
 * Answer to the retired one-person invite RPCs, for app versions that still
 * call them: what to do instead, in words the person can follow.
 */
export const RETIRED_PERSON_INVITE_MESSAGE =
  "invites for one person have been retired — update HaalKhata and share your own invite link or the group's link instead";

/** Maximum unanswered friend requests retained for one recipient. */
export const MAX_PENDING_FRIEND_REQUESTS = 100;

/**
 * Phone numbers and emails one FindContacts call may carry. Address books
 * are often larger; the client sends them in chunks of this size.
 */
export const MAX_CONTACT_IDENTIFIERS_PER_LOOKUP = 1000;

/**
 * Distinct identifiers one account may check per UTC day. A real address
 * book fits several times over; a script walking the phone-number space to
 * learn who uses HaalKhata does not (the Facebook contact-importer scrape).
 */
export const MAX_CONTACT_IDENTIFIERS_PER_DAY = 5000;

/**
 * Longest phone or email accepted from an address book, measured before it
 * is trimmed or parsed so an oversized entry costs nothing. 254 is the
 * longest email address SMTP allows; no phone number comes close.
 */
export const MAX_CONTACT_IDENTIFIER_LENGTH = 254;

/**
 * Most accounts one SendFriendRequests call may ask. The apps send one per
 * call (each Add); this bounds what the API accepts from anything else.
 */
export const MAX_FRIEND_REQUESTS_PER_SEND = 10;

/** Events per activity page when the client does not ask for a size. */
export const ACTIVITY_PAGE_SIZE = 25;

/** Hard ceiling on an activity page, so a client cannot ask for the whole table. */
export const MAX_ACTIVITY_PAGE_SIZE = 100;

/**
 * The UTC timestamp in a feed cursor: to the microsecond, as Postgres keeps
 * it, so a page never starts after events in the same millisecond as the
 * last one shown. Three fraction digits are still read, for a cursor from
 * before microseconds were kept.
 */
export const ACTIVITY_CURSOR_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(\d{3})?Z$/;

/** The same instant as a cursor timestamp, cut to the milliseconds a Date holds. */
export const ACTIVITY_CURSOR_MICROSECONDS_PATTERN = /(\.\d{3})\d{3}Z$/;

/** UUID shape generated for every activity row id. */
export const ACTIVITY_CURSOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
