/** How a payment method reads: its one-line summary, its copy text, and the host of a payment link. */

import { detailLabel, detailValueText, findDetailKind } from "./detailKinds";
import { displayHandle } from "./methods";
import {
  DAY_MS,
  HTTPS_LINK_PATTERN,
  MASK_VISIBLE_CHARACTERS,
  RECENT_CHANGE_DAYS,
} from "./payment.constants";
import { isPreset } from "./templates";
import type { PaymentDetailFields, PaymentMethodFields } from "./types";

/** What a method that works in every currency shows where a code would be. */
export const ANY_CURRENCY_LABEL = "Any";

/**
 * Kinds that identify a method at a glance, most telling first. A bank
 * method is recognised by its account number, not by the holder's name that
 * its form happens to list first.
 */
const SUMMARY_KINDS: readonly string[] = [
  "account_number",
  "iban",
  "phone",
  "email",
  "username",
  "link",
];

/**
 * The last few characters of a value, which is all the owner's list shows of
 * an account number.
 *
 * @param value - The stored value.
 * @returns Its last {@link MASK_VISIBLE_CHARACTERS} characters, spaces ignored.
 */
export function valueTail(value: string): string {
  return value.replace(/\s+/g, "").slice(-MASK_VISIBLE_CHARACTERS);
}

/**
 * The host a payment link points at, which is what the payer is shown on the
 * button before opening it.
 *
 * @param link - A stored link detail.
 * @returns The host name in lower case, or "" when the value is not an
 *   acceptable https link, in which case it must not be offered as a link.
 */
export function linkHost(link: string): string {
  return HTTPS_LINK_PATTERN.exec(link.trim())?.[1]?.toLowerCase() ?? "";
}

/**
 * The currency a method works in, as a short tag.
 *
 * @param method - The method being shown.
 * @returns Its ISO code, or {@link ANY_CURRENCY_LABEL}.
 */
export function methodCurrencyLabel(method: Pick<PaymentMethodFields, "currency">): string {
  return method.currency || ANY_CURRENCY_LABEL;
}

/**
 * The currency a method works in, as it reads inside a sentence: "preferred
 * method for BDT", "preferred method for any currency".
 *
 * @param method - The method being described.
 * @returns Its ISO code, or "any currency".
 */
export function methodCurrencyPhrase(method: Pick<PaymentMethodFields, "currency">): string {
  return method.currency || `${ANY_CURRENCY_LABEL.toLowerCase()} currency`;
}

/**
 * One detail as a short phrase for the owner's list.
 *
 * @param detail - The detail to describe.
 * @returns "Account ending 4821" for a masked kind, the bare value for an
 *   identifying kind, and "Label: value" for anything else.
 */
function detailSummary(detail: PaymentDetailFields): string {
  if (findDetailKind(detail.kind)?.masked) {
    const noun = detail.kind === "iban" ? "IBAN" : "Account";
    return `${noun} ending ${valueTail(detail.value)}`;
  }
  if (detail.kind === "link") return linkHost(detail.value) || detail.value;
  if (SUMMARY_KINDS.includes(detail.kind)) return detailValueText(detail);
  return `${detailLabel(detail)}: ${detailValueText(detail)}`;
}

/**
 * The one line under a method's name in its owner's list.
 *
 * @param method - The method to summarise.
 * @returns A built-in app's handle as it is printed on a profile; otherwise
 *   the method's most identifying detail, with account numbers masked; ""
 *   when the method has no details.
 */
export function methodSummary(method: PaymentMethodFields): string {
  const [first] = method.details;
  if (!first) return "";
  // An email or phone has no sigil to restore; only a username does.
  if (isPreset(method.preset) && first.kind === "username") {
    return displayHandle(method.preset, first.value);
  }
  const telling = SUMMARY_KINDS.map((kindKey) =>
    method.details.find((detail) => detail.kind === kindKey),
  ).find((detail) => detail !== undefined);
  return detailSummary(telling ?? first);
}

/**
 * What the Copy button beside one detail puts on the clipboard.
 *
 * @param method - The method the detail belongs to.
 * @param detail - The detail being copied.
 * @returns The value alone, ready to paste into a bank or wallet app. A
 *   built-in app's username carries its sigil, since that is what the app's
 *   own search expects.
 */
export function detailCopyText(
  method: Pick<PaymentMethodFields, "preset">,
  detail: PaymentDetailFields,
): string {
  if (isPreset(method.preset) && detail.kind === "username") {
    return displayHandle(method.preset, detail.value);
  }
  return detailValueText(detail);
}

/**
 * What "Copy all" puts on the clipboard: the method's name, one labelled
 * line per detail, and the note. Labelled, because it is pasted into a chat
 * or a notes app where the values alone would mean nothing.
 *
 * @param method - The method being copied.
 * @returns The lines joined by newlines.
 */
export function methodCopyText(method: PaymentMethodFields): string {
  const lines = [
    method.name,
    ...method.details.map((detail) => `${detailLabel(detail)}: ${detailCopyText(method, detail)}`),
  ];
  if (method.note.trim() !== "") lines.push(`Note: ${method.note.trim()}`);
  return lines.join("\n");
}

/** One detail paired with a key that is stable and unique within its method. */
export interface KeyedDetail {
  /** List key: the detail's content, numbered when the same content repeats. */
  key: string;
  detail: PaymentDetailFields;
}

/**
 * Pairs each detail with a list key. Details have no id of their own, and
 * an index would be the only thing telling two of them apart if they were
 * ever reordered, so the key is the content itself, with a counter for the
 * rare method that lists the same thing twice.
 *
 * @param details - A method's details, in order.
 * @returns The details with their keys, in the same order.
 */
export function keyedDetails(details: readonly PaymentDetailFields[]): KeyedDetail[] {
  const seen = new Map<string, number>();
  return details.map((detail) => {
    const content = `${detail.kind}:${detail.label}:${detail.value}`;
    const occurrence = seen.get(content) ?? 0;
    seen.set(content, occurrence + 1);
    return { key: `${content}#${occurrence}`, detail };
  });
}

/** What a payer is told about how recently a method's details came to be what they are. */
export interface RecentChange {
  /** "Added today", "Changed 3 days ago", and so on. */
  text: string;
  /**
   * True when the method was edited after it was added. Altered details
   * warrant a warning; a method that is simply new warrants a mention.
   */
  edited: boolean;
}

/**
 * What a payer is told when a method is new or its details changed recently.
 *
 * Details that suddenly differ are the mark of a payment being redirected,
 * by a compromised account or by someone with the owner's phone. The app
 * cannot tell an honest change from that, so it says the one thing it knows
 * and lets the payer ask. A method that was added and never touched is said
 * more quietly: everyone's methods are new once, and a warning shown to
 * every payer is a warning nobody reads.
 *
 * @param method - The method's creation and last-change stamps (ISO 8601).
 * @param nowMs - The current time in milliseconds, passed in so the answer can be tested.
 * @returns The wording and whether it is an edit; undefined once the change
 *   is older than {@link RECENT_CHANGE_DAYS} or the stamp does not parse.
 */
export function recentChange(
  method: { createdAt: string; updatedAt: string },
  nowMs: number,
): RecentChange | undefined {
  const changedMs = Date.parse(method.updatedAt);
  if (Number.isNaN(changedMs)) return undefined;
  const days = Math.floor((nowMs - changedMs) / DAY_MS);
  if (days < 0 || days > RECENT_CHANGE_DAYS) return undefined;
  const createdMs = Date.parse(method.createdAt);
  // An unreadable creation stamp is treated as an edit: the louder wording
  // is the safe one to fall back to.
  const edited = Number.isNaN(createdMs) || changedMs > createdMs;
  const verb = edited ? "Changed" : "Added";
  if (days === 0) return { text: `${verb} today`, edited };
  if (days === 1) return { text: `${verb} yesterday`, edited };
  return { text: `${verb} ${days} days ago`, edited };
}
