/** The P2P apps people actually settle with, and what each one can be handed. */

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
  },
  {
    key: "cashapp",
    label: "Cash App",
    handlePrefix: "$",
    handleExample: "jordanlee",
    takesHandle: true,
    linkable: true,
    linkCarriesAmount: false,
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
 * Venmo profile, or the whole `https://paypal.me/jordanlee` off a browser bar.
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
  let handle = typed.trim();
  if (methodKey === "venmo") return handle.replace(/^@+/, "");
  if (methodKey === "cashapp") return handle.replace(/^\$+/, "");
  if (methodKey === "paypal") {
    // Longest first: the scheme has to go before the bare host would match.
    handle = handle.replace(/^https?:\/\//i, "");
    handle = handle.replace(/^(?:www\.)?paypal\.me\//i, "");
    return handle.replace(/\/+$/, "");
  }
  return handle;
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
  // Stored handles are bare, but rows written before the prefix became static
  // text may still carry one — and a user can always paste. Normalising here
  // keeps every link correct regardless of which.
  const bare = stripHandlePrefix(methodKey, handle);
  if (!method?.linkable || bare === "") return "";
  const amount = (amountCents / 100).toFixed(2);

  if (methodKey === "venmo") {
    const parameters = new URLSearchParams({ txn: "pay", amount });
    if (note.trim()) parameters.set("note", note.trim());
    return `https://venmo.com/${encodeURIComponent(bare)}?${parameters}`;
  }
  if (methodKey === "cashapp") {
    // The $cashtag link cannot carry an amount; the sender types it.
    return `https://cash.app/$${encodeURIComponent(bare)}`;
  }
  if (methodKey === "paypal") {
    return `https://paypal.me/${encodeURIComponent(bare)}/${amount}`;
  }
  return "";
}
