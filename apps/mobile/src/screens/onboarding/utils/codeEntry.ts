/** Reading what was typed, pasted or autofilled into the verification code field. */

import { MAX_CODE_LENGTH, MIN_CODE_LENGTH } from "../constants/onboarding";

/**
 * Keeps the digits of whatever arrived, up to the longest code the server
 * accepts. A pasted "Your code is 123-456" still yields "123456".
 *
 * @param text - The field's new text.
 * @returns The digits, at most MAX_CODE_LENGTH of them.
 */
export function codeDigits(text: string): string {
  return text.replace(/\D/g, "").slice(0, MAX_CODE_LENGTH);
}

/**
 * Whether a change delivered a whole code at once: iOS's one-time-code
 * AutoFill from Messages, or a paste. Typed digits arrive one at a time.
 * A whole code is submitted on arrival; a typed one waits for Verify,
 * because the code's length depends on how the server's provider is set up.
 *
 * @param previous - The digits before the change.
 * @param next - The digits after it.
 * @returns True when a complete code arrived in one change.
 */
export function arrivedWhole(previous: string, next: string): boolean {
  return next.length >= MIN_CODE_LENGTH && next.length - previous.length >= MIN_CODE_LENGTH;
}

/**
 * Whether the code is long enough to send.
 *
 * @param code - The digits entered.
 * @returns True for four or more digits.
 */
export function canSubmitCode(code: string): boolean {
  return code.length >= MIN_CODE_LENGTH;
}
