/** How a payment method reads: its one-line summary, its copy text, and the host of a payment link. */

import { detailLabel, detailValueText, findDetailKind } from "./detailKinds";
import { displayHandle, findPaymentMethod } from "./methods";
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
 * What a payer is shown as a method's name.
 *
 * A built-in app's method can be given any name by its owner, and its
 * details and its "Open" button still belong to the app it was made for.
 * When the name does not say which app that is, the app is added, so a
 * Venmo method named "Totally Zelle" reads "Totally Zelle (Venmo)".
 *
 * @param method - The method being shown.
 * @returns The owner's name for it, followed by the app's name in brackets
 *   when the name alone would not tell a payer which app to open.
 */
export function methodDisplayName(method: Pick<PaymentMethodFields, "name" | "preset">): string {
  const builtIn = isPreset(method.preset) ? findPaymentMethod(method.preset) : undefined;
  if (!builtIn) return method.name;
  const lettersOf = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{Nd}]+/gu, "");
  return lettersOf(method.name).includes(lettersOf(builtIn.label))
    ? method.name
    : `${method.name} (${builtIn.label})`;
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

/** The stamps of a payment method that a payer's warning is worked out from. */
export interface ChangeMarked {
  id: string;
  /** ISO 4217 code; "" means any currency. */
  currency: string;
  /** When the method was added (ISO 8601). */
  createdAt: string;
  /** When its name, currency, details or note last changed. */
  updatedAt: string;
  /** Whether it carries the star for its currency. */
  preferred: boolean;
  /** When it was given that star; "" when unstarred or not known. */
  preferredAt: string;
}

/** What the warning is measured against. */
export interface ChangeContext {
  /**
   * The current time in milliseconds, by the server's clock where the
   * server sent one. Passed in, so the answer can be tested and does not
   * depend on the payer's device being set right.
   */
  nowMs: number;
  /** When the owner last removed one of their methods (ISO 8601); "" when never. */
  removedAt: string;
  /** Every method of the owner, this one included. */
  methods: readonly ChangeMarked[];
}

/** What a payer is told about how recently a method came to be what they are being shown. */
export interface RecentChange {
  /** "Added today", "Changed 3 days ago", "Made the preferred method yesterday". */
  text: string;
  /**
   * True when the payer should be asked to check before paying: the details
   * were edited, the method replaced another, or it only recently became the
   * one shown first. False for a method that is simply new.
   */
  caution: boolean;
}

/**
 * Says how long ago something happened, in the words the note uses.
 *
 * @param days - Whole days ago; zero for anything within the last day.
 * @returns "today", "yesterday" or "3 days ago".
 */
function daysAgoText(days: number): string {
  if (days === 0) return "today";
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * Picks the time to measure a method's stamps against.
 *
 * @param readAt - The server's clock when the methods were read (ISO 8601); "" from a server that sent none.
 * @param deviceNowMs - The device's clock, used only when the server's is missing or unreadable.
 * @returns Milliseconds since the epoch.
 */
export function changeClock(readAt: string, deviceNowMs: number): number {
  const serverMs = Date.parse(readAt);
  return Number.isNaN(serverMs) ? deviceNowMs : serverMs;
}

/**
 * What a payer is told when the place they are being sent changed recently.
 *
 * Details that suddenly differ are the mark of a payment being redirected,
 * by a compromised account or by someone with the owner's phone. The app
 * cannot tell an honest change from that, so it says the one thing it knows
 * and lets the payer ask. Three things count as a change, most telling first:
 *
 * 1. The method's details were edited.
 * 2. The method is new and its owner removed another one about the same
 *    time, in either order. Removing a method and adding one in its place
 *    is an edit by another route, and must not read as a merely new method.
 *    Every recently added method of that owner says so, since nothing
 *    records which one the removed method made way for.
 * 3. The method only recently took the star while an older method that
 *    could take the same money was there. The star decides which method a
 *    payer is shown first and has selected for them.
 *
 * A method that is new and none of these is mentioned quietly: everyone's
 * methods are new once, and a warning shown to every payer is a warning
 * nobody reads.
 *
 * A stamp ahead of the clock counts as "today", never as nothing. The
 * freshest change is the one that matters most, and it is exactly the one a
 * slow clock would put in the future.
 *
 * @param method - The method being shown.
 * @param context - The clock, the owner's last removal, and their other methods.
 * @returns The wording and whether it is a warning; undefined when nothing
 *   happened within {@link RECENT_CHANGE_DAYS}.
 */
export function recentChange(method: ChangeMarked, context: ChangeContext): RecentChange | undefined {
  /**
   * How many whole days ago a stamp is, if it is recent enough to mention.
   *
   * @param stamp - An ISO 8601 time, possibly empty.
   * @returns The days, or undefined when the stamp is unreadable or older than the window.
   */
  const recentDays = (stamp: string): number | undefined => {
    const stampMs = Date.parse(stamp);
    if (Number.isNaN(stampMs)) return undefined;
    const days = Math.max(0, Math.floor((context.nowMs - stampMs) / DAY_MS));
    return days > RECENT_CHANGE_DAYS ? undefined : days;
  };

  const createdMs = Date.parse(method.createdAt);
  const changedMs = Date.parse(method.updatedAt);
  const changedDays = recentDays(method.updatedAt);
  // An unreadable creation stamp is treated as an edit: the louder wording
  // is the safe one to fall back to.
  const edited = !Number.isNaN(changedMs) && (Number.isNaN(createdMs) || changedMs > createdMs);
  if (edited && changedDays !== undefined) {
    return { text: `Changed ${daysAgoText(changedDays)}`, caution: true };
  }

  const addedDays = recentDays(method.createdAt);
  if (addedDays !== undefined && recentDays(context.removedAt) !== undefined) {
    return {
      text: `Added ${daysAgoText(addedDays)}, and another method was removed recently`,
      caution: true,
    };
  }

  const starredDays = method.preferred ? recentDays(method.preferredAt) : undefined;
  if (starredDays !== undefined) {
    const starredMs = Date.parse(method.preferredAt);
    const tookOver = context.methods.some(
      (other) =>
        other.id !== method.id &&
        Date.parse(other.createdAt) < starredMs &&
        (other.currency === method.currency || other.currency === "" || method.currency === ""),
    );
    if (tookOver) {
      return { text: `Made the preferred method ${daysAgoText(starredDays)}`, caution: true };
    }
  }

  return addedDays === undefined
    ? undefined
    : { text: `Added ${daysAgoText(addedDays)}`, caution: false };
}
