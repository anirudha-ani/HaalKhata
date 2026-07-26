/** Routing for the single "email or phone" field both apps present. */

/** An account identifier split into the two fields the RPCs take. */
export interface SplitIdentifier {
  /** The identifier when it looks like an email address; "" otherwise. */
  email: string;
  /** The identifier when it does not look like an email; "" otherwise. */
  phone: string;
}

/**
 * Splits a raw identifier string into `{ email, phone }` for the auth and
 * friend-invite RPCs. If the value contains an `@` it is treated as an email;
 * otherwise it is sent as a phone for the server to normalize and validate.
 * Exactly one field is ever populated.
 *
 * Deliberately crude: this only decides which server-side validator runs, so
 * a stricter client-side guess would just reject addresses the server would
 * have accepted. `normalizePhone` and `EMAIL_PATTERN` are the real checks.
 *
 * @param identifier - Raw user input from an "email or phone" field.
 * @returns `{ email, phone }` with exactly one populated.
 */
export function splitIdentifier(identifier: string): SplitIdentifier {
  const trimmed = identifier.trim();
  return trimmed.includes("@") ? { email: trimmed, phone: "" } : { email: "", phone: trimmed };
}
