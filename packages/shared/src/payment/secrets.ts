/** Spotting a label that asks for something a payment method must never hold. */

import { LOOKALIKE_LETTERS, SECRET_PHRASES, SECRET_WORDS } from "./payment.constants";

/**
 * Whether a label names a secret or a payment card.
 *
 * A payment method holds what someone needs to send money, never what would
 * let them take it. The label is the one place that says what a value is,
 * so it is what gets checked: "PIN", "Card number", "Security code".
 *
 * The check works on whole words, so "Shipping" and "Opinion" are not
 * mistaken for "pin". It reads through the ways a word gets disguised:
 * full-width letters, letters spaced or dotted apart ("P I N", "p.i.n"),
 * two words run together or split ("card number", "cardnumber"), and letters
 * swapped for ones that look the same ("РIN" in Cyrillic, "P1N"). The swap is
 * only undone for this check: what the person typed is kept as they typed it.
 *
 * @param label - The label as typed, with hidden characters already removed.
 * @returns True when the label asks for a secret.
 */
export function namesSecret(label: string): boolean {
  const words = Array.from(label.normalize("NFKC").toLowerCase(), (character) => LOOKALIKE_LETTERS[character] ?? character)
    .join("")
    .split(/[^\p{L}\p{Nd}]+/u)
    .filter((word) => word !== "");
  if (words.some((word) => SECRET_WORDS.includes(word) || SECRET_PHRASES.includes(word))) {
    return true;
  }
  // Two words side by side: "card number", "security code".
  if (words.some((word, index) => SECRET_PHRASES.includes(`${word}${words[index + 1] ?? ""}`))) {
    return true;
  }
  // Letters set apart: "P I N" arrives as three one-letter words.
  const spelled = words.every((word) => Array.from(word).length === 1) ? words.join("") : "";
  return SECRET_WORDS.includes(spelled);
}
