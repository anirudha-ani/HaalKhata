/**
 * The one check of whether text is an email address. The server, both apps,
 * the address-book lookup and the payment-method form all use it, so none of
 * them can accept what another refuses or skip the length limit.
 */

import {
  EMAIL_SHAPE_PATTERN,
  MAX_EMAIL_LENGTH,
  MAX_EMAIL_LOCAL_PART_LENGTH,
} from "./email.constants";

/**
 * Whether text is shaped like an email address. The lengths are measured
 * first, so the shape is only ever read on an address-sized string.
 *
 * @param value - The address, already trimmed; case does not matter.
 * @returns True for something@something.something within the standard's lengths.
 */
export function isEmailAddress(value: string): boolean {
  if (value.length > MAX_EMAIL_LENGTH) return false;
  if (value.indexOf("@") > MAX_EMAIL_LOCAL_PART_LENGTH) return false;
  return EMAIL_SHAPE_PATTERN.test(value);
}

/**
 * The spelling an address is stored and compared in: trimmed and
 * lower-cased, the way the users table compares addresses.
 *
 * @param typed - An address as typed or saved.
 * @returns The canonical address, or null when it is not one.
 */
export function canonicalEmail(typed: string): string | null {
  const email = typed.trim().toLowerCase();
  return isEmailAddress(email) ? email : null;
}
