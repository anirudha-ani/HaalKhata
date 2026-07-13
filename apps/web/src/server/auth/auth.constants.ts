/** Auth domain constants: token lifetime, avatar palette, data directory, email/phone checks. */

import path from "node:path";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/** How long an issued bearer token stays valid, in seconds (30 days). */
export const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

/** Fixed set of avatar background colors; one is picked deterministically per email. */
export const AVATAR_PALETTE = [
  "#c73e2e", "#0f8a5f", "#b45309", "#1d4ed8",
  "#7c3aed", "#be185d", "#0e7490", "#4d7c0f",
];

/** Directory holding server-local state such as the generated dev session secret. */
export const DATA_DIRECTORY =
  process.env.HAALKHATA_DATA_DIR ?? path.join(process.cwd(), "data");

/** Loose sanity check for email addresses: something@something.tld, no whitespace. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Max login/signup attempts per key (IP or email) per 60s window. */
export const AUTH_RATE_LIMIT = 10;

/** Minimum password length accepted at signup. */
export const PASSWORD_MIN_LENGTH = 6;
/**
 * Maximum password length accepted at signup. scrypt has no built-in input
 * cap, so an unbounded password length is a CPU-DoS vector; 1024 bytes is
 * far above any reasonable passphrase while keeping scrypt fast.
 */
export const PASSWORD_MAX_LENGTH = 1024;

/**
 * Normalizes and validates a phone number to E.164. Returns the canonical
 * `+<country><number>` form, or null when the input isn't a valid number.
 *
 * @param phone - Raw phone string from the client (may include spaces, dashes, etc).
 * @returns The E.164 form (e.g. "+8801712345678"), or null when invalid.
 */
export function normalizePhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (trimmed.length === 0) return null;
  const parsed = parsePhoneNumberFromString(trimmed);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}
