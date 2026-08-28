/** Auth domain constants: token lifetime, avatar palette, data directory, email/phone checks. */

import path from "node:path";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/** How long an issued bearer token stays valid, in seconds (30 days). */
export const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

/**
 * How long a pending account-merge confirmation stays valid, in seconds.
 *
 * Short on purpose: the token authorizes absorbing another row, and it is
 * meant to be confirmed on the screen that issued it. Ten minutes covers
 * someone reading the preview carefully and leaves nothing usable afterwards.
 */
export const MERGE_TOKEN_LIFETIME_SECONDS = 60 * 10;

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

/** Max phone-verification and merge attempts per account per minute. */
export const PHONE_VERIFICATION_RATE_LIMIT = 5;

/** Timeout for each call to the external phone-verification provider. */
export const PHONE_VERIFICATION_TIMEOUT_MS = 10_000;

/** Twilio Verify v2 base URL; fixed so user input can never influence the destination. */
export const TWILIO_VERIFY_BASE_URL = "https://verify.twilio.com/v2";

/** Verification codes are numeric and between four and ten digits. */
export const PHONE_VERIFICATION_CODE_PATTERN = /^\d{4,10}$/;

/**
 * OAuth client id that a Google ID token must name as its audience. Only the
 * client id is needed: the ID-token flow verifies a signed assertion the
 * browser already holds, so there is no code-for-token exchange and therefore
 * no client secret to deploy. Never add one here.
 */
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";

/**
 * Whether email/phone + password sign-in is accepted. Google is the only way
 * into a production deploy; the password flows survive in development so
 * seeded accounts stay reachable without a Google round trip.
 *
 * Read at call time rather than captured in a module-level constant so tests
 * can exercise both sides of the switch.
 *
 * @returns True outside production, where SignUp/LogIn still work.
 */
export function passwordAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Minimum password length accepted at signup. */
export const PASSWORD_MIN_LENGTH = 6;
/**
 * Maximum password length accepted at signup. scrypt has no built-in input
 * cap, so an unbounded password length is a CPU-DoS vector; 1024 bytes is
 * far above any reasonable passphrase while keeping scrypt fast.
 */
export const PASSWORD_MAX_LENGTH = 1024;

/**
 * Region assumed when a phone number is typed without a country code. This is
 * a US-first product, so "(617) 555-1212" and "6175551212" resolve to +1.
 * A number written with an explicit `+<country>` is always honored regardless
 * of this setting, so international users are never blocked by it.
 */
export const DEFAULT_PHONE_REGION = "US";

/** Shown whenever a phone number fails to parse, so the caller knows the accepted shapes. */
export const PHONE_FORMAT_HINT =
  'please enter a valid phone number, e.g. "(617) 555-1212" or "+14155552671"';

/**
 * Normalizes and validates a phone number to E.164. Accepts national formats
 * for {@link DEFAULT_PHONE_REGION} (punctuation and spacing are ignored) as
 * well as any explicitly international `+<country>...` number.
 *
 * @param phone - Raw phone string from the client (may include spaces, dashes, parentheses).
 * @returns The E.164 form (e.g. "+14155552671"), or null when invalid.
 */
export function normalizePhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (trimmed.length === 0) return null;
  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_PHONE_REGION);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/**
 * Maximum length of a payment handle. Generous next to a Venmo username or a
 * $cashtag, but bounded — handles are stored verbatim and rendered as-is.
 */
export const MAX_PAYMENT_HANDLE_LENGTH = 120;
