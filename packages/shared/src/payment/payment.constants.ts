/** Payment-method limits and the patterns each kind of detail is checked against. */

/** Most payment methods one person can keep. */
export const MAX_PAYMENT_METHODS_PER_USER = 12;

/** Most details one payment method can carry. */
export const MAX_PAYMENT_DETAILS_PER_METHOD = 8;

/**
 * Longest text a field is read at all. Far above every real limit, so that
 * padding around a paste never trips it, and low enough that nothing typed
 * or sent can make a pattern or a phone-number parse run on megabytes.
 */
export const MAX_RAW_FIELD_LENGTH = 1000;

/**
 * Most detail rows a draft is read at all, blank ones included. A form sends
 * at most {@link MAX_PAYMENT_DETAILS_PER_METHOD}; the room above that is for
 * blank rows, which are dropped rather than counted.
 */
export const MAX_RAW_DETAIL_ROWS = 32;

/** How much of a refused value an error message repeats back. */
export const MAX_ECHOED_CHARACTERS = 20;

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
 * Words that name a secret when one stands as a whole word in a label. A
 * payment method holds what someone needs to send money, never what would
 * let them take it.
 *
 * "pincode", written as one word, is deliberately absent: it is what India
 * calls a postal code. "PIN code" as two words is still refused, because the
 * word "pin" standing alone is.
 */
export const SECRET_WORDS: readonly string[] = [
  "pin",
  "pins",
  "mpin",
  "tpin",
  "password",
  "passwords",
  "passcode",
  "passcodes",
  "passphrase",
  "cvv",
  "cvv2",
  "cvc",
  "cvc2",
  "otp",
  "otps",
];

/**
 * Two-word names of a secret or of a payment card, written run together the
 * way they are matched: "security code", "card number". A card is here
 * because its number is what pays, not what gets paid.
 */
export const SECRET_PHRASES: readonly string[] = [
  "securitycode",
  "verificationcode",
  "cardnumber",
  "cardno",
  "cardnum",
  "debitcard",
  "creditcard",
  "cardexpiry",
  "expirydate",
  "expirationdate",
];

/** What a refused secret is told, wherever the check runs. */
export const SECRET_REFUSAL = "never share a PIN, password, card number or security code here";

/**
 * The characters an account number is made of in any country: letters and
 * digits, with a space, dash, dot or slash between groups. A Czech account
 * carries a slash, a German one nothing but digits.
 */
export const ACCOUNT_NUMBER_PATTERN = /^[\p{L}\p{Nd}][\p{L}\p{Nd} ./-]*$/u;

/** The characters a routing number, sort code or transit number is made of. */
export const ROUTING_NUMBER_PATTERN = /^[\p{L}\p{Nd}][\p{L}\p{Nd} -]*$/u;

/** A digit in any script; an account or routing number has at least one. */
export const DIGIT_PATTERN = /\p{Nd}/u;

/**
 * Anything that starts a new line or does not print: the control characters
 * (a line break and a tab among them) and the Unicode line and paragraph
 * separators, which sit unseen in one line on screen and become a line break
 * once the text is pasted somewhere else. Every field here is one line.
 */
export const CONTROL_CHARACTER_PATTERN = /[\p{Cc}\p{Zl}\p{Zp}]/u;

/** The one currency Venmo moves. */
export const VENMO_CURRENCY = "USD";

/** Decimals a Venmo link takes for an amount. */
export const VENMO_AMOUNT_DIGITS = 2;

/**
 * The currencies PayPal moves between accounts in different countries, and
 * the decimals it accepts for each. Forints, yen and New Taiwan dollars are
 * whole numbers there. Reals, ringgit and yuan are left out: PayPal holds
 * them only for accounts inside their own country.
 */
export const PAYPAL_CURRENCY_DIGITS: Readonly<Record<string, number>> = {
  AUD: 2,
  CAD: 2,
  CHF: 2,
  CZK: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  HUF: 0,
  ILS: 2,
  JPY: 0,
  MXN: 2,
  NOK: 2,
  NZD: 2,
  PHP: 2,
  PLN: 2,
  SEK: 2,
  SGD: 2,
  THB: 2,
  TWD: 0,
  USD: 2,
};

/**
 * Most currencies a sentence names when saying what an app sends. Past
 * this, it says which one the app does not send instead.
 */
export const MAX_LISTED_CURRENCIES = 3;

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

/**
 * Letters and digits that read as a Latin letter, lower-cased, for reading a
 * label the way somebody looking at it would. Greek and Cyrillic capitals
 * count as the capital they look like, so "ΡΙΝ" reads as "pin".
 */
export const LOOKALIKE_LETTERS: Readonly<Record<string, string>> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", і: "i", ј: "j", ѕ: "s",
  α: "a", β: "b", ε: "e", ι: "i", κ: "k", μ: "m", ν: "n", ο: "o", ρ: "p", τ: "t", υ: "y", χ: "x",
  "0": "o", "1": "i", "3": "e", "5": "s",
};
