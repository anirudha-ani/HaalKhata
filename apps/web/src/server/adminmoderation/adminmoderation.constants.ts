/** Admin moderation domain constants: queue sizes, rate limits and the words removed content is replaced with. */

/**
 * Most pieces of reported content the queue lists at once, longest waiting
 * first. A queue this long is a backlog to work through, not a page to read
 * in one go; the rest appear as the first ones are handled.
 */
export const REPORT_QUEUE_LIMIT = 100;

/** Most suspended accounts the page lists, most recently suspended first. */
export const SUSPENDED_LIST_LIMIT = 100;

/**
 * Queue reads accepted per minute across all admin sessions. There is one
 * operator; the ceiling stops a refresh loop, not an attacker, who cannot
 * get past the admin session.
 */
export const MODERATION_READ_RATE_LIMIT = 30;

/** Moderation actions accepted per minute across all admin sessions. */
export const MODERATION_WRITE_RATE_LIMIT = 30;

/**
 * Shape of a report id. Reports are keyed by the UUIDs `newId()` mints;
 * anything else cannot name one and is refused before it reaches SQL.
 */
export const REPORT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What removed content is replaced with. These are the words
 * apps/web/src/server/safety/repo/moderation.sql writes, so content removed
 * from the admin page and content removed with ops/moderate.sh read the
 * same; the moderation integration test runs both and compares.
 */
export const REMOVED_CONTENT = {
  /** An expense's description. Its notes are emptied. */
  expenseDescription: "Content removed",
  /** Each of an expense's item names. */
  itemName: "Item",
  /** A group's name. */
  groupName: "Shared group",
  /** A person's display name. Their profile picture is cleared. */
  profileName: "Member",
  /** Feed lines and notifications that quoted the content. */
  quotation: "Content removed after moderation",
} as const;
