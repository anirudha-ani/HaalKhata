/** Reading the SMS verification code a person enters, and saying when it cannot be ours. */

import {
  DIGIT_RUN_PATTERN,
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
  /**
   * True when a whole code arrived in one change (the keyboard's code
   * suggestion, or a paste) and nothing else could explain the change, so it
   * can be checked at once. Typed digits, and any reading that is a guess,
   * wait for Verify.
   */
  arrivedWhole: boolean;
}

/** What one inserted text reads as. */
interface InsertionReading {
  /** The one whole code it holds, if it holds exactly one. */
  code: string | undefined;
  /** How many digits it carries, for saying why it cannot be ours. */
  digitCount: number;
}

/**
 * Reads one change to the code field.
 *
 * Typing keeps the digits, up to a code's length. Several digits arriving at
 * once are a paste or the keyboard's code suggestion. That insertion is read
 * on its own, wherever it landed among the digits already there, and when it
 * holds one whole code, that code replaces the field: joined to leftover
 * digits and cut to fit, it would be sent as a code nobody texted. A pasted
 * message is read for the one code among its other numbers. An insertion
 * that holds no whole code cannot be ours, most often a code the keyboard
 * offered from another message, so the field keeps what it held, the notice
 * says so with both lengths, and nothing cut to fit can be sent.
 *
 * Only a reading that nothing else could explain is checked at once:
 * - A field left holding exactly one code is kept, because a suggestion may
 *   replace the field rather than land at the cursor, and the digits typed
 *   before it were then the start of the same code. The same field can also
 *   be leftover digits joined to a shorter code from another message, so it
 *   waits for Verify.
 * - An insertion that could have landed in more than one place, reading as a
 *   different code in each, keeps the reading after the digits already there
 *   (where the cursor sits after typing) and waits for Verify too.
 *
 * @param previous - The code the field held before this change.
 * @param entered - The field's full text after the change.
 * @returns The code to keep, the notice to show, and whether to check it at once.
 */
export function readVerificationCode(previous: string, entered: string): CodeEntry {
  const digits = entered.replace(NON_DIGIT_PATTERN, "");
  if (digits.length - previous.length < PASTED_CODE_MIN_DIGITS) {
    return { code: digits.slice(0, VERIFICATION_CODE_LENGTH), notice: "", arrivedWhole: false };
  }
  const readings = insertionPlacements(previous, entered).map(readInsertion);
  const [likeliest] = readings;
  const codes = new Set(readings.map((reading) => reading.code));
  if (likeliest.code && codes.size === 1) {
    return { code: likeliest.code, notice: "", arrivedWhole: true };
  }
  if (isCompleteVerificationCode(digits)) return { code: digits, notice: "", arrivedWhole: false };
  if (likeliest.code) return { code: likeliest.code, notice: "", arrivedWhole: false };
  return { code: previous, notice: codeLengthMessage(likeliest.digitCount), arrivedWhole: false };
}

/**
 * Finds the text a change inserted, and every other place it could have
 * landed among the digits the field held.
 *
 * The change is the shortest edit between the two texts: what the field kept
 * at each end is matched first, the start before the end, so text added after
 * the typed digits is read as added there. An insertion beside a character
 * equal to its own last one could equally have landed one place further
 * left: "48" followed by "29137548" is also "48291375" followed by "48".
 * Each such placement is returned as well.
 *
 * @param previous - The code the field held before the change.
 * @param entered - The field's full text after it.
 * @returns The inserted text at every place it could have landed, the
 *   placement after the most kept digits first.
 */
function insertionPlacements(previous: string, entered: string): string[] {
  let start = 0;
  while (start < previous.length && previous[start] === entered[start]) start += 1;
  let keptAtEnd = 0;
  while (
    keptAtEnd < previous.length - start &&
    previous[previous.length - 1 - keptAtEnd] === entered[entered.length - 1 - keptAtEnd]
  ) {
    keptAtEnd += 1;
  }
  const length = entered.length - keptAtEnd - start;
  const placements = [entered.slice(start, start + length)];
  // Only an insertion can slide: a change that also replaced digits removed
  // them from one place.
  if (start + keptAtEnd < previous.length) return placements;
  for (let from = start; from > 0 && entered[from - 1] === entered[from - 1 + length]; from -= 1) {
    placements.push(entered.slice(from - 1, from - 1 + length));
  }
  return placements;
}

/**
 * Reads one inserted text: its digits when they make a whole code (a code
 * written with spaces or a dash), otherwise its only whole run of digits (a
 * message that also names how many minutes the code lasts).
 *
 * @param inserted - The text a change inserted.
 * @returns The code it holds, if exactly one, and how many digits it carries.
 */
function readInsertion(inserted: string): InsertionReading {
  const joined = inserted.replace(NON_DIGIT_PATTERN, "");
  if (isCompleteVerificationCode(joined)) return { code: joined, digitCount: joined.length };
  const wholeRuns = (inserted.match(DIGIT_RUN_PATTERN) ?? []).filter(isCompleteVerificationCode);
  return { code: wholeRuns.length === 1 ? wholeRuns[0] : undefined, digitCount: joined.length };
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
