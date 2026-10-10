/** Payment-method limits and the patterns each kind of detail is checked against. */

/** Most payment methods one person can keep. */
export const MAX_PAYMENT_METHODS_PER_USER = 12;

/** Most details one payment method can carry. */
export const MAX_PAYMENT_DETAILS_PER_METHOD = 8;

/** Loose sanity check for an email detail: something@something.tld, no whitespace. */
export const PAYMENT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A SWIFT / BIC code: eight characters, or eleven with a branch. */
export const SWIFT_PATTERN = /^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/;

/**
 * The shape every IBAN shares: 15 to 34 letters and digits. The per-country
 * length and the checksum are deliberately not checked. A rule tuned to one
 * country's format is the hand-maintained list this feature exists to avoid.
 */
export const IBAN_PATTERN = /^[A-Z0-9]{15,34}$/;

/**
 * A payment link: https only, and a plain ASCII host name with nothing in
 * front of it. The first group is the host.
 *
 * Strict on purpose, because the host is what the payer is shown before they
 * open it. A "user@" part, a backslash or a look-alike Unicode letter can
 * each make a link display one site and open another, so none of them is
 * accepted rather than each being parsed correctly.
 */
export const HTTPS_LINK_PATTERN =
  /^https:\/\/((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?::\d{1,5})?(?:[/?#]\S*)?$/i;

/**
 * Labels that name a secret. A payment method holds what someone needs to
 * send money, never what would let them take it.
 */
export const SECRET_LABEL_PATTERN = /\b(?:pin|password|passcode|cvv|cvc|otp)\b/i;

/** Any control character, including a line break: every field here is one line. */
export const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

/** How many trailing characters of a masked value stay visible. */
export const MASK_VISIBLE_CHARACTERS = 4;

/**
 * How long after an edit a payer is told that a method's details changed.
 * Long enough to cover someone who pays every other week, short enough that
 * the note means something when it appears.
 */
export const RECENT_CHANGE_DAYS = 14;

/** Milliseconds in a day, for turning a change's age into days. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Detail kinds that make a method a bank transfer in the settlement record.
 * A method the person defined has no category of its own; holding one of
 * these is what a bank account looks like.
 */
export const BANK_DETAIL_KINDS: readonly string[] = [
  "account_number",
  "iban",
  "routing_number",
  "swift",
];
