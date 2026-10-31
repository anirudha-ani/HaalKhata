/** Joining phrases the way a sentence does — pure. */

/**
 * Joins phrases as English lists them: "a", "a and b", "a, b and c".
 *
 * @param phrases - The phrases, in the order to say them.
 * @returns The joined phrase; "" for none.
 */
export function listInWords(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases.join("");
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}
