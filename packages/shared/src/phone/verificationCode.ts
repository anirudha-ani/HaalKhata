/** Reading the SMS verification code a person enters, and saying when it cannot be ours. */

import {
  NON_DIGIT_PATTERN,
  PASTED_CODE_MIN_DIGITS,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_CODE_PATTERN,
} from "./phone.constants";

/** What the code field holds after a change, and the line to show beneath it. */
export interface CodeEntry {
  /** Digits kept in the field, at most {@link VERIFICATION_CODE_LENGTH}. */
  code: string;
  /** Why a pasted or suggested code cannot be ours; empty otherwise. */
  notice: string;
}

/**
 * Reads one change to the code field.
 *
 * Typing keeps the digits, up to a code's length. Several digits arriving at
 * once are a paste or the keyboard's code suggestion, and that insertion is
 * the code the person picked, so it replaces what the field held instead of
 * joining it: a suggestion tapped beside leftover digits would otherwise be
 * cut to fit and sent as a code nobody texted. A field left holding exactly
 * one code is taken whole, because a suggestion may also replace the field
 * rather than land at the cursor, and the digits typed before it were then
 * the start of the same code. An inserted code of another length came from
 * another message, most often one the keyboard offered before ours arrived,
 * and the notice says so with both lengths.
 *
 * @param previous - The code the field held before this change.
 * @param entered - The field's full text after the change.
 * @returns The code to keep and the notice to show.
 */
export function readVerificationCode(previous: string, entered: string): CodeEntry {
  const digits = entered.replace(NON_DIGIT_PATTERN, "");
  const added = digits.length - previous.length;
  if (added < PASTED_CODE_MIN_DIGITS) {
    return { code: digits.slice(0, VERIFICATION_CODE_LENGTH), notice: "" };
  }
  if (digits.length === VERIFICATION_CODE_LENGTH) return { code: digits, notice: "" };
  const inserted = digits.startsWith(previous)
    ? digits.slice(previous.length)
    : digits.endsWith(previous)
      ? digits.slice(0, added)
      : digits;
  return {
    code: inserted.slice(0, VERIFICATION_CODE_LENGTH),
    notice: inserted.length === VERIFICATION_CODE_LENGTH ? "" : codeLengthMessage(inserted.length),
  };
}

/**
 * Whether the field holds a whole code, the only thing worth sending.
 *
 * @param code - The code as the field holds it.
 * @returns True for exactly {@link VERIFICATION_CODE_LENGTH} digits.
 */
export function isCompleteVerificationCode(code: string): boolean {
  return VERIFICATION_CODE_PATTERN.test(code);
}

/**
 * Says why a code of another length cannot be ours, naming both lengths.
 * Shared by both apps and the server, which says the same to an older app
 * that still sends any length. Worded like the server's other refusals,
 * since it is shown in the same place as them.
 *
 * @param digitCount - Digits in the code that was entered.
 * @returns The sentence to show beside the field.
 */
export function codeLengthMessage(digitCount: number): string {
  const unit = digitCount === 1 ? "digit" : "digits";
  return `that code has ${digitCount} ${unit} and ours have ${VERIFICATION_CODE_LENGTH}, use the code in our latest text`;
}
