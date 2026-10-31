/** The P2P apps people actually settle with, and what each one can be handed. */

import { PAYPAL_CURRENCY_DIGITS, VENMO_CURRENCY } from "./payment.constants";

/** One way of paying somebody back. */
export interface PaymentMethod {
  /** Stable key stored on settlements and payment handles. */
  key: string;
  /** Name shown in the UI. */
  label: string;
  /**
   * The fixed part of the handle, rendered as static text in front of the
   * input rather than typed.
   *
   * Showing "@" as a placeholder left it ambiguous whether it should be typed,
   * so half the handles stored it and half did not. Making it furniture
   * removes the question: the field holds only the part that varies, and what
   * is stored is always the bare identifier.
   */
  handlePrefix: string;

  /**
   * A worked example of the *editable* part, shown as the placeholder.
   *
   * An example rather than a description ("jordan-lee", not "username")
   * because the question people have is what to type, and a sample answers it
   * without being read as a label. Numbers use the 555 range reserved for
   * fiction.
   */
  handleExample: string;
  /** Whether a handle is worth storing (cash and bank transfers have none). */
  takesHandle: boolean;
  /**
   * Whether a link can be built that opens the app on the right person.
   * Zelle deliberately has none: it lives inside each bank's own app and has
   * no universal scheme, so the useful affordance there is copying the handle.
   */
  linkable: boolean;
  /**
   * Whether that link can also carry the amount. Cash App's `$cashtag` link
   * cannot — the sender types the amount — so promising otherwise would be a
   * lie the UI tells.
   */
  linkCarriesAmount: boolean;
  /**
   * The shape of this app's username, when it has one. Its link is built
   * from the username, so anything else (a space, a slash, a whole URL that
   * could not be unpicked) would be stored only to open a page that does not
   * exist. Absent for apps reached by something else.
   */
  handlePattern?: RegExp;
  /** What to tell someone whose username does not have that shape. */
  handleRule?: string;
  /**
   * The currencies the app moves, for the four that are services. An amount
   * owed in any other currency cannot be sent through it as it stands, which
   * the settle screen says instead of handing the app a number it would read
   * as its own currency.
   */
  currencies?: readonly string[];
}

/**
 * Settlement methods, in the order they are offered. US-first: Venmo, Zelle
 * and Cash App are how this actually gets settled, with cash and bank
 * transfers as the fallbacks that need no handle.
 */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  {
    key: "venmo",
    label: "Venmo",
    handlePrefix: "@",
    handleExample: "jordan-lee",
    takesHandle: true,
    linkable: true,
    linkCarriesAmount: true,
    handlePattern: /^[A-Za-z0-9_-]{1,30}$/,
    handleRule: "a Venmo username is letters, numbers, dashes and underscores, as on your profile",
    currencies: [VENMO_CURRENCY],
  },
  {
    key: "zelle",
    // No prefix: Zelle is reached by whichever of a phone or an email the
    // recipient registered with their bank, so there is no fixed part. The
    // account page offers a phone/email toggle instead, which is also how the
    // phone gets a country code — Zelle matches the exact registered string,
    // and a bare "4015550147" is ambiguous outside the US.
    label: "Zelle",
    handlePrefix: "",
    handleExample: "",
    takesHandle: true,
    linkable: false,
    linkCarriesAmount: false,
    currencies: ["USD"],
  },
  {
    key: "cashapp",
    label: "Cash App",
    handlePrefix: "$",
    handleExample: "jordanlee",
    takesHandle: true,
    linkable: true,
    linkCarriesAmount: false,
    handlePattern: /^[A-Za-z0-9_-]{1,20}$/,
    handleRule: "a $cashtag is up to 20 letters and numbers",
    currencies: ["USD", "GBP"],
  },
  {
    key: "paypal",
    // The prefix is the whole URL stem, because that is what people copy off
    // a PayPal profile. paymentLink builds paypal.me/<handle>, so storing the
    // pasted URL would yield paypal.me/https://paypal.me/jordanlee.
    label: "PayPal",
    handlePrefix: "paypal.me/",
    handleExample: "jordanlee",
    takesHandle: true,
    linkable: true,
    linkCarriesAmount: true,
    // Letters and numbers, which is PayPal's own rule. It also keeps "." and
    // ".." out of a link: a browser would read paypal.me/../2500JPY as
    // somebody else's page called 2500JPY.
    handlePattern: /^[A-Za-z0-9]{1,40}$/,
    handleRule: "a PayPal.Me name is letters and numbers, the part after paypal.me/",
    currencies: Object.keys(PAYPAL_CURRENCY_DIGITS),
  },
  {
    key: "cash",
    label: "Cash",
    handlePrefix: "",
    handleExample: "",
    takesHandle: false,
    linkable: false,
    linkCarriesAmount: false,
  },
  {
    key: "bank",
    label: "Bank transfer",
    handlePrefix: "",
    handleExample: "",
    takesHandle: false,
    linkable: false,
    linkCarriesAmount: false,
  },
  {
    key: "other",
    label: "Other",
    handlePrefix: "",
    handleExample: "",
    takesHandle: false,
    linkable: false,
    linkCarriesAmount: false,
  },
];

/** Just the method keys, for server-side validation. */
export const PAYMENT_METHOD_KEYS = PAYMENT_METHODS.map((method) => method.key);

/** The methods worth storing a handle for, i.e. what the account page offers. */
export const HANDLE_METHODS = PAYMENT_METHODS.filter((method) => method.takesHandle);

/**
 * Looks up a payment method by key.
 *
 * @param methodKey - Method key, e.g. "venmo".
 * @returns The method, or undefined for an unknown key.
 */
export function findPaymentMethod(methodKey: string): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((method) => method.key === methodKey);
}

/**
 * Reduces whatever was typed or pasted to the bare identifier that gets
 * stored — no sigil, no URL stem.
 *
 * The field shows its prefix as static text, so a careful user types only the
 * bare part. This exists for the careless path: pasting `@jordan-lee` off a
 * Venmo profile, or a whole `https://paypal.me/jordanlee`,
 * `https://venmo.com/u/jordan-lee` or `https://cash.app/$jordanlee` off a
 * browser bar.
 * Without it those become `@@jordan-lee` and `paypal.me/https://paypal.me/...`
 * once the prefix is rendered back.
 *
 * Idempotent, so it is safe to run on already-clean values and on rows written
 * before the prefix moved out of the input.
 *
 * @param methodKey - Which app the handle belongs to.
 * @param typed - Whatever the user typed or pasted.
 * @returns The bare identifier, trimmed.
 */
export function stripHandlePrefix(methodKey: string, typed: string): string {
  // Longest first: the scheme has to go before the bare host would match.
  const pasted = typed.trim().replace(/^https?:\/\//i, "");
  if (methodKey === "venmo") {
    const handle = pasted.replace(/^(?:www\.|account\.)?venmo\.com\/(?:u\/)?/i, "");
    // Trimmed again: "@ jordan" leaves a space behind its sigil.
    return dropTrailingSlashes(handle).replace(/^@+/, "").trim();
  }
  if (methodKey === "cashapp") {
    const handle = pasted.replace(/^(?:www\.)?cash\.app\//i, "");
    return dropTrailingSlashes(handle).replace(/^\$+/, "").trim();
  }
  if (methodKey === "paypal") {
    return dropTrailingSlashes(pasted.replace(/^(?:www\.)?paypal\.me\//i, "")).trim();
  }
  return typed.trim();
}

/**
 * Removes the slashes a pasted URL ends with.
 *
 * Walks back from the end instead of using a pattern. The obvious pattern,
 * one or more slashes anchored at the end, retries from every slash in a
 * long run that does not reach the end, so its cost grows with the square of
 * the input and one megabyte of slashes holds the thread for minutes.
 *
 * @param text - The text to shorten.
 * @returns The text without its trailing slashes.
 */
function dropTrailingSlashes(text: string): string {
  let kept = text.length;
  while (kept > 0 && text[kept - 1] === "/") kept -= 1;
  return text.slice(0, kept);
}

/**
 * The handle as a human should read it — prefix included.
 *
 * Storage keeps the bare identifier so it is unambiguous; the payer wants the
 * form they would recognise on a profile, which is what this returns and what
 * the copy button puts on the clipboard.
 *
 * @param methodKey - Which app the handle belongs to.
 * @param handle - The stored handle, bare or otherwise.
 * @returns Prefixed handle, or "" when there is no handle.
 */
export function displayHandle(methodKey: string, handle: string): string {
  const bare = stripHandlePrefix(methodKey, handle);
  if (bare === "") return "";
  return `${findPaymentMethod(methodKey)?.handlePrefix ?? ""}${bare}`;
}
