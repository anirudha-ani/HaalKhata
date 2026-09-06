/** Social domain constants. */

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

/**
 * Unauthenticated invite-link previews allowed per client address per
 * minute. The token itself is the credential; this just keeps the endpoint
 * from being a scanning surface.
 */
export const INVITE_PREVIEW_RATE_LIMIT = 30;

/** Maximum unanswered friend requests retained for one recipient. */
export const MAX_PENDING_FRIEND_REQUESTS = 100;

/** Events per activity page when the client does not ask for a size. */
export const ACTIVITY_PAGE_SIZE = 25;

/** Hard ceiling on an activity page, so a client cannot ask for the whole table. */
export const MAX_ACTIVITY_PAGE_SIZE = 100;

/** Canonical UTC timestamp spelling emitted by the database boundary. */
export const ACTIVITY_CURSOR_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** UUID shape generated for every activity row id. */
export const ACTIVITY_CURSOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
