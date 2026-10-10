/** Which of a person's payment methods a payer is shown for a currency, which one comes first, and how the choice is recorded. */

import { BANK_DETAIL_KINDS } from "./payment.constants";
import { isPreset } from "./templates";
import type { PaymentMethodFields } from "./types";

/** The two facts about a method that decide where it sits for a payer. */
export interface PayableMethod {
  /** ISO 4217 code the method works in; "" means any currency. */
  currency: string;
  /** Whether the owner starred it for its currency. */
  preferred: boolean;
}

/** A person's methods split by whether they work in the currency being paid. */
export interface MethodsForCurrency<Method> {
  /** Methods that work in the currency, best first. */
  usable: Method[];
  /** Methods tied to some other currency, in the owner's order. */
  others: Method[];
}

/** Rank given to a method that does not work in the currency at all. */
const UNUSABLE_RANK = 4;

/**
 * Where a method sits for a payment in a currency. Lower is better:
 * starred for this currency, starred for any currency, plain for this
 * currency, plain for any currency.
 *
 * A method tied to the currency outranks an any-currency one at the same
 * star level, because the owner said something specific about this currency.
 *
 * @param method - The method to place.
 * @param currency - ISO 4217 code of the payment.
 * @returns 0 to 3 for a usable method, {@link UNUSABLE_RANK} otherwise.
 */
function methodRank(method: PayableMethod, currency: string): number {
  const methodCurrency = method.currency.toUpperCase();
  const exact = methodCurrency === currency.toUpperCase();
  if (!exact && methodCurrency !== "") return UNUSABLE_RANK;
  if (method.preferred) return exact ? 0 : 1;
  return exact ? 2 : 3;
}

/**
 * Splits a person's methods for a payment in one currency.
 *
 * @param methods - The person's methods, in the owner's order (oldest first).
 * @param currency - ISO 4217 code of the payment.
 * @returns The methods usable in that currency, best first and otherwise in
 *   the owner's order, and the ones tied to another currency.
 */
export function methodsForCurrency<Method extends PayableMethod>(
  methods: readonly Method[],
  currency: string,
): MethodsForCurrency<Method> {
  const ranked = methods.map((method, position) => ({
    method,
    position,
    rank: methodRank(method, currency),
  }));
  const usable = ranked
    .filter((entry) => entry.rank < UNUSABLE_RANK)
    // Ties keep the owner's order: Array.prototype.sort is stable, but the
    // position is compared explicitly so that does not have to be relied on.
    .sort((left, right) => left.rank - right.rank || left.position - right.position)
    .map((entry) => entry.method);
  const others = ranked
    .filter((entry) => entry.rank === UNUSABLE_RANK)
    .map((entry) => entry.method);
  return { usable, others };
}

/**
 * The method a settle dialog opens on for a payment in one currency.
 *
 * @param methods - The recipient's methods, in the owner's order.
 * @param currency - ISO 4217 code of the payment.
 * @returns The best usable method, or undefined when none works in that
 *   currency and the dialog should fall back to cash.
 */
export function defaultMethod<Method extends PayableMethod>(
  methods: readonly Method[],
  currency: string,
): Method | undefined {
  return methodsForCurrency(methods, currency).usable[0];
}

/**
 * The method the owner actually starred for a currency. Unlike
 * {@link defaultMethod} this never falls back to an unstarred one: it backs
 * wording such as "prefers bKash", which must not be said about a method
 * nobody chose.
 *
 * @param methods - The owner's methods.
 * @param currency - ISO 4217 code of the payment.
 * @returns The starred method for that currency, else the starred
 *   any-currency one, else undefined.
 */
export function preferredMethod<Method extends PayableMethod>(
  methods: readonly Method[],
  currency: string,
): Method | undefined {
  const best = defaultMethod(methods, currency);
  return best?.preferred ? best : undefined;
}

/** One way of paying that needs no details from anybody. */
export interface PlainPayChoice {
  /** Key stored on the settlement. */
  key: string;
  /** Text on its chip. */
  label: string;
}

/** Key of the "Cash" choice, which is also what a settle dialog falls back to. */
export const CASH_CHOICE = "cash";

/**
 * The choices offered after a person's own methods: money handed over, and
 * anything this app has no word for. Their keys are settlement method keys.
 */
export const PLAIN_PAY_CHOICES: readonly PlainPayChoice[] = [
  { key: CASH_CHOICE, label: "Cash" },
  { key: "other", label: "Other" },
];

/**
 * What a settle dialog has selected when it opens for a currency.
 *
 * @param methods - The methods offered, in the owner's order.
 * @param currency - ISO 4217 code of the payment.
 * @returns The id of the best usable method, or {@link CASH_CHOICE} when none works in that currency.
 */
export function defaultPayChoice<Method extends PayableMethod & { id: string }>(
  methods: readonly Method[],
  currency: string,
): string {
  return defaultMethod(methods, currency)?.id ?? CASH_CHOICE;
}

/**
 * The method key a settlement is recorded under for the way it was paid.
 *
 * Settlements keep one of a fixed set of keys. A built-in app has its own; a
 * method the person defined is a bank transfer when it carries bank details
 * and "other" when it does not.
 *
 * @param choice - A plain choice's key, used when no method was picked.
 * @param method - The payment method picked, if any.
 * @returns A settlement method key: venmo, zelle, cashapp, paypal, cash, bank or other.
 */
export function settlementMethodKey(
  choice: string,
  method?: Pick<PaymentMethodFields, "preset" | "details">,
): string {
  if (!method) return PLAIN_PAY_CHOICES.some((plain) => plain.key === choice) ? choice : "other";
  if (isPreset(method.preset)) return method.preset;
  return method.details.some((detail) => BANK_DETAIL_KINDS.includes(detail.kind)) ? "bank" : "other";
}
