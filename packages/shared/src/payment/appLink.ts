/**
 * The "Open Venmo" link of a built-in app's method: where it goes, whether
 * it carries the amount, and what the payer is told either way.
 *
 * The rule the whole file exists for: an amount goes into a link only when
 * the app would read it as the same money the payer owes. That takes three
 * things at once. The app moves that currency, the method is set up for
 * that currency (or for any), and the amount can be written exactly in the
 * decimals the app accepts. If any one fails, the link opens the app with no
 * amount and the line beside it says why. A wrong amount that looks filled
 * in by the app is worse than an empty field.
 */

import { formatMoney } from "../money/money";
import { minorUnitDigits } from "../money/money.constants";
import { findPaymentMethod, stripHandlePrefix, type PaymentMethod } from "./methods";
import {
  MAX_LISTED_CURRENCIES,
  PAYPAL_CURRENCY_DIGITS,
  VENMO_AMOUNT_DIGITS,
  VENMO_CURRENCY,
} from "./payment.constants";

/** What a built-in app's link is built from. */
export interface AppLinkRequest {
  /** The method's preset key: venmo, zelle, cashapp or paypal. */
  preset: string;
  /** The method's one detail, as stored. */
  handle: string;
  /** The currency the method is set up for; "" for any. */
  methodCurrency: string;
  /** The amount being paid, in the minor units of `currency`. */
  amountCents: number;
  /** The currency of the debt being paid. */
  currency: string;
  /** The payer's note, passed along where the app takes one. */
  note: string;
}

/** A built-in app's link, ready to show. */
export interface AppPaymentLink {
  /** The app's name, for the button. */
  label: string;
  /** The https link; "" when the app has none or the username cannot make one. */
  url: string;
  /** Whether the link carries the amount. */
  carriesAmount: boolean;
  /** One line for the payer: what opening it does, and why not more. */
  hint: string;
}

/**
 * Joins currency codes the way a sentence lists them.
 *
 * @param codes - One or more ISO codes.
 * @returns "USD", or "USD and GBP".
 */
function listCodes(codes: readonly string[]): string {
  if (codes.length <= 1) return codes.join("");
  return `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
}

/**
 * Why the money owed is not money this method takes as it stands.
 *
 * @param builtIn - The app.
 * @param methodCurrency - What the method is set up for; "" for any.
 * @param currency - The currency of the debt.
 * @returns A sentence naming the mismatch, or "" when there is none.
 */
function currencyGap(builtIn: PaymentMethod, methodCurrency: string, currency: string): string {
  const sends = builtIn.currencies ?? [];
  if (!sends.includes(currency)) {
    return sends.length <= MAX_LISTED_CURRENCIES
      ? `${builtIn.label} sends ${listCodes(sends)} and this payment is in ${currency}.`
      : `${builtIn.label} does not send ${currency}.`;
  }
  if (methodCurrency !== "" && methodCurrency !== currency) {
    return `This ${builtIn.label} is set up for ${methodCurrency} and this payment is in ${currency}.`;
  }
  return "";
}

/**
 * How many decimals an app's link takes for an amount in a currency.
 *
 * @param appKey - venmo or paypal; the others take no amount.
 * @param currency - The currency of the amount.
 * @returns The decimals, or undefined when the link takes no amount in it.
 */
function linkAmountDigits(appKey: string, currency: string): number | undefined {
  if (appKey === "venmo") return currency === VENMO_CURRENCY ? VENMO_AMOUNT_DIGITS : undefined;
  if (appKey === "paypal") return PAYPAL_CURRENCY_DIGITS[currency];
  return undefined;
}

/**
 * Writes an amount of minor units as a decimal number, exactly.
 *
 * Integer arithmetic throughout: the amount is never divided into a
 * fraction and rounded back, so what the link says is what is owed to the
 * last unit.
 *
 * @param amountCents - The amount in minor units; must be a positive whole number.
 * @param storedDigits - Decimals the amount is kept in (2 for USD, 0 for JPY).
 * @param takenDigits - Decimals the link accepts.
 * @returns "43.25", "3500", or undefined when there is no amount or it has
 *   more decimals than the link accepts.
 */
function exactAmount(
  amountCents: number,
  storedDigits: number,
  takenDigits: number,
): string | undefined {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return undefined;
  const scale = 10 ** storedDigits;
  const fraction = amountCents % scale;
  const whole = (amountCents - fraction) / scale;
  if (storedDigits <= takenDigits) {
    return storedDigits === 0
      ? String(whole)
      : `${whole}.${String(fraction).padStart(storedDigits, "0")}`;
  }
  // The link takes fewer decimals than the amount is kept in. Only an
  // amount with nothing in the extra places can be written without rounding.
  const dropped = 10 ** (storedDigits - takenDigits);
  if (fraction % dropped !== 0) return undefined;
  return takenDigits === 0
    ? String(whole)
    : `${whole}.${String(fraction / dropped).padStart(takenDigits, "0")}`;
}

/**
 * Builds an app's link to one person.
 *
 * @param appKey - venmo, cashapp or paypal.
 * @param handle - The bare username, already checked against the app's shape.
 * @param amount - The exact amount to carry, or undefined to carry none.
 * @param currency - The currency of that amount.
 * @param note - The payer's note.
 * @returns The https link.
 */
function buildUrl(
  appKey: string,
  handle: string,
  amount: string | undefined,
  currency: string,
  note: string,
): string {
  const person = encodeURIComponent(handle);
  if (appKey === "venmo") {
    const parameters = new URLSearchParams({ txn: "pay" });
    if (amount !== undefined) parameters.set("amount", amount);
    if (note.trim()) parameters.set("note", note.trim());
    return `https://venmo.com/${person}?${parameters}`;
  }
  // The $cashtag link cannot carry an amount; the sender types it.
  if (appKey === "cashapp") return `https://cash.app/$${person}`;
  // PayPal.Me reads a bare amount in the recipient's own default currency,
  // so the code always goes with it.
  return amount === undefined
    ? `https://paypal.me/${person}`
    : `https://paypal.me/${person}/${amount}${currency}`;
}

/**
 * Works out the link for a built-in app's method and the line shown with it.
 *
 * @param request - The method's app, username and currency, and the payment's amount, currency and note.
 * @returns The link and its hint; undefined when the method is not a
 *   built-in app's, which has no such link.
 */
export function appPaymentLink(request: AppLinkRequest): AppPaymentLink | undefined {
  const builtIn = findPaymentMethod(request.preset);
  if (!builtIn?.takesHandle) return undefined;
  const label = builtIn.label;
  const currency = request.currency.trim().toUpperCase();
  const mismatch =
    currency === ""
      ? ""
      : currencyGap(builtIn, request.methodCurrency.trim().toUpperCase(), currency);
  const withMismatch = (sentence: string) => (mismatch ? `${sentence} ${mismatch}` : sentence);

  if (!builtIn.linkable) {
    return {
      label,
      url: "",
      carriesAmount: false,
      hint: withMismatch(`${label} has no shareable link. Paste this into your banking app.`),
    };
  }
  const handle = stripHandlePrefix(builtIn.key, request.handle);
  if (handle === "" || (builtIn.handlePattern && !builtIn.handlePattern.test(handle))) {
    return {
      label,
      url: "",
      carriesAmount: false,
      hint: withMismatch(`This username can't be opened as a link. Search for it in ${label}.`),
    };
  }
  if (!builtIn.linkCarriesAmount) {
    return {
      label,
      url: buildUrl(builtIn.key, handle, undefined, currency, request.note),
      carriesAmount: false,
      hint: withMismatch(`${label} can't carry an amount in a link. Type it in the app.`),
    };
  }

  const takenDigits = mismatch === "" && currency !== "" ? linkAmountDigits(builtIn.key, currency) : undefined;
  const amount =
    takenDigits === undefined
      ? undefined
      : exactAmount(request.amountCents, minorUnitDigits(currency), takenDigits);
  if (amount !== undefined) {
    return {
      label,
      url: buildUrl(builtIn.key, handle, amount, currency, request.note),
      carriesAmount: true,
      hint: `Opens ${label} with ${formatMoney(request.amountCents, currency)} filled in. You still confirm it there.`,
    };
  }

  const bareLink = buildUrl(builtIn.key, handle, undefined, currency, request.note);
  if (mismatch !== "" || takenDigits === undefined) {
    return {
      label,
      url: bareLink,
      carriesAmount: false,
      hint: `Opens ${label} with no amount filled in. ${mismatch || `${label} can't be given an amount in ${currency || "this currency"}.`}`,
    };
  }
  // What is left is an amount the link cannot state: one with more decimals
  // than the app takes, or none typed yet.
  const hasFraction =
    Number.isSafeInteger(request.amountCents) &&
    request.amountCents > 0 &&
    takenDigits < minorUnitDigits(currency);
  return {
    label,
    url: bareLink,
    carriesAmount: false,
    hint: hasFraction
      ? `Opens ${label} with no amount filled in. ${label} takes whole ${currency} amounts only.`
      : `Opens ${label}. Enter an amount here first and it will be filled in for you.`,
  };
}
