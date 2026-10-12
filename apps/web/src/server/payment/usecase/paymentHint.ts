/** The line a reminder carries about how its sender wants to be paid: method names only, never an identifier. */

import { methodsForCurrency, preferredMethod } from "@haalkhata/shared/payment/payeeMethods";
import { MAX_HINT_METHOD_NAMES } from "@/server/payment/payment.constants";

/** What the hint reads off a payment method. */
interface HintMethod {
  name: string;
  /** ISO 4217 code; "" means any currency. */
  currency: string;
  preferred: boolean;
}

/**
 * Joins words the way a sentence lists them: "a", "a and b", "a, b and c".
 *
 * @param words - Words to join, at least one.
 * @returns The joined list.
 */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * What can be said about paying in one currency.
 *
 * "Prefers" is said only of a method the owner starred. With none starred,
 * the methods that work in the currency are listed, a few at most, because a
 * reminder that says nothing about where to send money leaves the debtor to
 * ask, which is the question the reminder was meant to answer.
 *
 * @param methods - The sender's methods, oldest first.
 * @param currency - ISO 4217 code of a balance being reminded about.
 * @returns "prefers bKash", "takes bKash and Nagad", or "" when they have
 *   nothing for that currency.
 */
function currencyPhrase(methods: readonly HintMethod[], currency: string): string {
  const starred = preferredMethod(methods, currency);
  if (starred) return `prefers ${starred.name}`;
  const names = methodsForCurrency(methods, currency)
    .usable.slice(0, MAX_HINT_METHOD_NAMES)
    .map((method) => method.name);
  return names.length > 0 ? `takes ${joinWords(names)}` : "";
}

/**
 * Builds the sentence a reminder adds about how its sender wants to be paid.
 *
 * Names only. The identifiers stay out of the notification on purpose: a
 * notification is a stored row, and an account number copied into it would
 * outlive the debt and the method. The debtor opens the settle dialog for
 * the details, where they are read fresh.
 *
 * @param senderName - Display name of the person owed.
 * @param methods - The sender's payment methods, oldest first.
 * @param currencies - Currencies the debtor owes in, in the order the reminder names them.
 * @returns One sentence, e.g. "Rahim prefers bKash." or "Rahim prefers
 *   bKash for BDT and takes Zelle for USD."; "" when there is nothing to say.
 */
export function reminderPaymentHint(
  senderName: string,
  methods: readonly HintMethod[],
  currencies: readonly string[],
): string {
  const firstName = senderName.trim().split(/\s+/)[0] || "They";
  const phrases = currencies
    .map((currency) => ({ currency, phrase: currencyPhrase(methods, currency) }))
    .filter((entry) => entry.phrase !== "");
  if (phrases.length === 0) return "";
  // One currency, or one method that covers them all: no need to say which
  // currency the phrase is about.
  const everyCurrencyCovered = phrases.length === currencies.length;
  if (everyCurrencyCovered && new Set(phrases.map((entry) => entry.phrase)).size === 1) {
    return `${firstName} ${phrases[0]!.phrase}.`;
  }
  return `${firstName} ${joinWords(phrases.map((entry) => `${entry.phrase} for ${entry.currency}`))}.`;
}
