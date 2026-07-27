/** The P2P apps people actually settle with, and what each one can be handed. */

/** One way of paying somebody back. */
export interface PaymentMethod {
  /** Stable key stored on settlements and payment handles. */
  key: string;
  /** Name shown in the UI. */
  label: string;
  /** What the handle is called in that app, used as the input's placeholder. */
  handleLabel: string;
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
    handleLabel: "@username",
    takesHandle: true,
    linkable: true,
    linkCarriesAmount: true,
  },
  {
    key: "zelle",
    label: "Zelle",
    handleLabel: "email or phone",
    takesHandle: true,
    linkable: false,
    linkCarriesAmount: false,
  },
  {
    key: "cashapp",
    label: "Cash App",
    handleLabel: "$cashtag",
    takesHandle: true,
    linkable: true,
    linkCarriesAmount: false,
  },
  {
    key: "paypal",
    label: "PayPal",
    handleLabel: "PayPal.Me name",
    takesHandle: true,
    linkable: true,
    linkCarriesAmount: true,
  },
  {
    key: "cash",
    label: "Cash",
    handleLabel: "",
    takesHandle: false,
    linkable: false,
    linkCarriesAmount: false,
  },
  {
    key: "bank",
    label: "Bank transfer",
    handleLabel: "",
    takesHandle: false,
    linkable: false,
    linkCarriesAmount: false,
  },
  {
    key: "other",
    label: "Other",
    handleLabel: "",
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
 * Builds a link that opens the payer's app on the right person, prefilled as
 * far as that app allows.
 *
 * Only web URLs are produced, never custom schemes: `venmo://` shows a
 * browser error when the app is not installed, whereas venmo.com redirects
 * into the app when it is and works in the browser when it is not.
 *
 * @param methodKey - Which app to open.
 * @param handle - The recipient's handle for that app.
 * @param amountCents - Amount to prefill, ignored by methods that cannot take one.
 * @param note - Payment note, included only where the app accepts one.
 * @returns The URL, or "" when this method has no link.
 */
export function paymentLink(
  methodKey: string,
  handle: string,
  amountCents: number,
  note: string,
): string {
  const method = findPaymentMethod(methodKey);
  const trimmed = handle.trim();
  if (!method?.linkable || trimmed === "") return "";
  const amount = (amountCents / 100).toFixed(2);

  if (methodKey === "venmo") {
    // Venmo takes the username without its leading "@".
    const parameters = new URLSearchParams({ txn: "pay", amount });
    if (note.trim()) parameters.set("note", note.trim());
    return `https://venmo.com/${encodeURIComponent(trimmed.replace(/^@/, ""))}?${parameters}`;
  }
  if (methodKey === "cashapp") {
    // The $cashtag link cannot carry an amount; the sender types it.
    return `https://cash.app/$${encodeURIComponent(trimmed.replace(/^\$/, ""))}`;
  }
  if (methodKey === "paypal") {
    return `https://paypal.me/${encodeURIComponent(trimmed)}/${amount}`;
  }
  return "";
}
