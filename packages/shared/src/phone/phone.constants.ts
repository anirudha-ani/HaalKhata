/** The SMS verification code: its length, how the field reads it, and the lines shown beside it. */

/**
 * Digits in every verification code we text. It mirrors the "Code length"
 * setting of the Twilio Verify service and has to change with it: both apps
 * send nothing else, and the server refuses anything else before the
 * provider is asked.
 */
export const VERIFICATION_CODE_LENGTH = 8;

/** A whole code and nothing else. */
export const VERIFICATION_CODE_PATTERN = new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`);

/** Anything in the code field that is not a digit. */
export const NON_DIGIT_PATTERN = /\D/g;

/** Each run of digits in a pasted message, for finding the one code among other numbers. */
export const DIGIT_RUN_PATTERN = /\d+/g;

/**
 * Fewest digits that can arrive in one change only by pasting or by tapping
 * the keyboard's code suggestion. Typing adds one digit per change.
 */
export const PASTED_CODE_MIN_DIGITS = 4;

/**
 * Longest text the code field takes. Well above a code, so a pasted message
 * or a suggestion landing beside leftover digits arrives whole and can be
 * read, rather than being cut to fit by the field before anything sees it.
 */
export const VERIFICATION_CODE_INPUT_MAX_CHARACTERS = 64;

/** Shown under the code field until there is something more specific to say. */
export const VERIFICATION_CODE_HINT = `Enter the ${VERIFICATION_CODE_LENGTH}-digit code from our latest text.`;

/** Shown under the code field after the code was sent again. */
export const VERIFICATION_CODE_RESENT = "Sent again. Use the code in our latest text.";
