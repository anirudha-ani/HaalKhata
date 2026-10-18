/** Limits for reading an address book into a FindContacts lookup. */

/**
 * Identifiers per FindContacts call; the server refuses more. A larger
 * address book goes in several calls of this size.
 */
export const CONTACT_LOOKUP_CHUNK_SIZE = 1000;

/**
 * Longest phone or email read from an address book, measured before it is
 * trimmed or parsed, matching the server's own limit.
 */
export const MAX_ADDRESS_BOOK_FIELD_LENGTH = 254;

/**
 * Most people one SendFriendRequests call may ask, matching the server's
 * limit; a longer list is split into calls of this size. The apps send one
 * person per call (each Add), so this only bounds what the server accepts.
 */
export const FRIEND_REQUESTS_PER_SEND = 50;
