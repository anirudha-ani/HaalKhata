/** Email address lengths from the mail standard, and the one shape every part of the app accepts. */

/**
 * Longest address mail can be delivered to: RFC 5321 caps a path at 256
 * octets, two of which are its angle brackets. Measured before the shape is
 * read, so a megabyte in an email field costs nothing.
 */
export const MAX_EMAIL_LENGTH = 254;

/** Longest part before the "@" (RFC 5321 §4.5.3.1.1). */
export const MAX_EMAIL_LOCAL_PART_LENGTH = 64;

/**
 * Loose on purpose: something@something.something, with one "@" and no
 * spaces. The provider that verified an address at sign-in is the real
 * check; this one only spots text that was never an address, so it must not
 * refuse an unusual address somebody actually has.
 *
 * Every piece stops at the character the next piece starts with and cannot
 * contain it (the part before the "@" holds no "@", a domain label no dot),
 * so any text can be read only one way and the time taken grows with its
 * length. The pattern it replaced let the first domain label swallow dots,
 * and a run of them took seconds to refuse.
 */
export const EMAIL_SHAPE_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
