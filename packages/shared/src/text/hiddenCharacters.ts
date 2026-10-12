/**
 * Removing what a reader cannot see from text one person types and another
 * person acts on.
 *
 * A zero-width space pasted along with an account number, or a character
 * that flips the direction the digits are drawn in, makes what is shown
 * differ from what is copied. Neither is visible, so neither can be pointed
 * out to the person who typed it; they are taken out instead of refused.
 */

/**
 * Every Unicode "format" character: zero-width spaces and joiners, the
 * marks, overrides and isolates that change text direction, the byte-order
 * mark, the soft hyphen, the word joiner and the invisible tag characters.
 */
const FORMAT_CHARACTER_PATTERN = /\p{Cf}/u;

/**
 * The few format characters that are drawn: the Arabic and Syriac signs that
 * sit before a number or an abbreviation. They are part of what a reader
 * sees, so words keep them.
 */
const DRAWN_FORMAT_PATTERN = /[\u0600-\u0605\u06DD\u070F\u0890\u0891\u08E2\u{110BD}\u{110CD}]/u;

/**
 * Letters that draw as blank space: the Hangul fillers and the empty Braille
 * cell. Not format characters, but just as invisible in a name.
 */
const BLANK_LETTER_PATTERN = /[ᅟᅠㅤﾠ⠀]/u;

/** Any character this module removes somewhere, for the quick way out. */
const ANY_HIDDEN_PATTERN = /[\p{Cf}ᅟᅠㅤﾠ⠀]/u;

/**
 * The two joiners. Bengali, Devanagari, Persian and other scripts use them
 * between letters to choose how those letters are drawn, so words in those
 * scripts need them kept.
 */
const JOINERS: readonly string[] = ["‌", "‍"];

/** Highest code point of plain ASCII, which never takes a joiner. */
const LAST_ASCII_CODE_POINT = 0x7f;

/**
 * Whether a character is one a joiner can sit beside: something drawn, from
 * a script outside ASCII.
 *
 * @param character - One whole character, or undefined at either end of the text.
 * @returns True when a joiner next to it has something to shape.
 */
function takesJoiner(character: string | undefined): boolean {
  if (character === undefined) return false;
  if ((character.codePointAt(0) ?? 0) <= LAST_ASCII_CODE_POINT) return false;
  return !/\s/u.test(character) && !ANY_HIDDEN_PATTERN.test(character);
}

/**
 * Removes every character a reader cannot see.
 *
 * @param text - The text as typed, pasted or stored.
 * @param keepJoiners - True for words a person reads (a name, a note), where
 *   a joiner between two letters of a script that uses joiners is kept, and
 *   so are the few format characters that are drawn. False for an identifier
 *   someone copies (an account number, a username, a link), which loses
 *   every format character.
 * @returns The text without hidden characters. What remains is drawn the way
 *   it is stored.
 */
export function stripHiddenCharacters(text: string, keepJoiners: boolean): string {
  if (!ANY_HIDDEN_PATTERN.test(text)) return text;
  const characters = Array.from(text);
  return characters
    .filter((character, index) => {
      if (BLANK_LETTER_PATTERN.test(character)) return false;
      if (!FORMAT_CHARACTER_PATTERN.test(character)) return true;
      if (keepJoiners && DRAWN_FORMAT_PATTERN.test(character)) return true;
      if (!keepJoiners || !JOINERS.includes(character)) return false;
      return takesJoiner(characters[index - 1]) && takesJoiner(characters[index + 1]);
    })
    .join("");
}
