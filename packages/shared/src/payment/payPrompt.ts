/** When to remind someone that people owe them and have nowhere to send it, and how that reminder reads. */

import { methodsForCurrency, type PayableMethod } from "./payeeMethods";

/** Somebody the person shares balances with, reduced to what the prompt reads. */
export interface PromptCounterparty {
  /** Display name. */
  name: string;
  /** Their balance per currency; cents > 0 means they owe the person. */
  balances: readonly { currency: string; cents: number }[];
}

/** One currency in which the person is owed and has no way to be paid. */
export interface PayPrompt {
  /** ISO 4217 code. */
  currency: string;
  /** Everything owed to the person in that currency. */
  cents: number;
  /** First names of the people who owe it, largest debt first. */
  names: string[];
}

/**
 * Finds the first currency in which people owe the person money and none of
 * the person's payment methods works.
 *
 * One currency at a time on purpose. Adding a method for it makes the next
 * one surface by itself, and a single sentence with a single button is
 * something people act on, where a list of gaps is something they close.
 *
 * @param counterparties - Everyone the person has a balance with.
 * @param methods - The person's own payment methods.
 * @param currencyOrder - Currencies in the order the screen lists them (the
 *   person's default first); a currency not in it comes after those.
 * @returns What to prompt about, or undefined when every currency they are
 *   owed in has a method that works.
 */
export function findPayPrompt(
  counterparties: readonly PromptCounterparty[],
  methods: readonly PayableMethod[],
  currencyOrder: readonly string[],
): PayPrompt | undefined {
  const owed = new Map<string, { name: string; cents: number }[]>();
  for (const counterparty of counterparties) {
    for (const balance of counterparty.balances) {
      if (balance.cents <= 0) continue;
      const debtors = owed.get(balance.currency) ?? [];
      debtors.push({ name: counterparty.name, cents: balance.cents });
      owed.set(balance.currency, debtors);
    }
  }
  const position = (currency: string) => {
    const listed = currencyOrder.indexOf(currency);
    return listed === -1 ? currencyOrder.length : listed;
  };
  const currency = [...owed.keys()]
    .sort((left, right) => position(left) - position(right) || left.localeCompare(right))
    .find((candidate) => methodsForCurrency(methods, candidate).usable.length === 0);
  if (currency === undefined) return undefined;
  const debtors = [...(owed.get(currency) ?? [])].sort((left, right) => right.cents - left.cents);
  return {
    currency,
    cents: debtors.reduce((total, debtor) => total + debtor.cents, 0),
    names: debtors.map((debtor) => debtor.name.trim().split(/\s+/)[0] ?? ""),
  };
}

/**
 * Says who owes the person, in a sentence that still fits a banner when
 * there are many of them.
 *
 * @param names - First names of the people who owe, as {@link PayPrompt} lists them.
 * @param amount - The total owed, already formatted with its currency.
 * @returns "Pia owes you $35.00", "Pia and Rahim owe you $35.00", or
 *   "3 people owe you $35.00".
 */
export function owedLine(names: readonly string[], amount: string): string {
  if (names.length === 1) return `${names[0]} owes you ${amount}`;
  if (names.length === 2) return `${names[0]} and ${names[1]} owe you ${amount}`;
  return `${names.length} people owe you ${amount}`;
}
