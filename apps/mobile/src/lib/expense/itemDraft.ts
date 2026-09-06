/** Pure helpers for an itemized-expense draft: totals, completeness, and conversion to/from the API. */

import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import { nextDraftKey } from "@haalkhata/shared/expense/draftKey";

/** One editable line item on an itemized draft. */
export interface DraftItem {
  /** Stable client-side key (items have no server id until saved). */
  key: string;
  /** Item name as parsed from a receipt, loaded from the expense, or typed. */
  name: string;
  /** How many of this item were bought (minimum 1). */
  quantity: number;
  /** Raw money input, e.g. "14.50". */
  total: string;
  /** Map of user id to whether that person shares this item. */
  assignees: Record<string, boolean>;
}

/** A line as the API speaks it — a parsed receipt item or a stored expense item. */
export interface ItemLine {
  name: string;
  quantity: number;
  totalCents: number;
  /** Who shares it; absent on a freshly parsed receipt. */
  assignments?: readonly { userId: string }[];
}

/** The money a draft adds up to. */
export interface DraftTotals {
  itemsTotalCents: number;
  taxCents: number;
  tipCents: number;
  grandTotalCents: number;
}

/**
 * Sums a draft: item lines plus the raw tax and tip inputs.
 *
 * @param items - The draft's line items.
 * @param taxInput - Raw tax money input.
 * @param tipInput - Raw tip money input.
 * @returns The subtotal, tax, tip, and the grand total the expense will carry.
 */
export function draftTotals(
  items: DraftItem[],
  taxInput: string,
  tipInput: string,
  currency: string,
): DraftTotals {
  const itemsTotalCents = items.reduce(
    (sumCents, item) => sumCents + (parseMoneyInput(item.total, currency) ?? 0),
    0,
  );
  const taxCents = parseMoneyInput(taxInput, currency) ?? 0;
  const tipCents = parseMoneyInput(tipInput, currency) ?? 0;
  return { itemsTotalCents, taxCents, tipCents, grandTotalCents: itemsTotalCents + taxCents + tipCents };
}

/**
 * Counts the items nobody has been assigned to yet.
 *
 * @param items - The draft's line items.
 * @returns How many items still need at least one person.
 */
export function unassignedCount(items: DraftItem[]): number {
  return items.filter((item) => !Object.values(item.assignees).some(Boolean)).length;
}

/**
 * Says whether a draft can be saved, and if not, what is missing — in the
 * order somebody would fix it.
 *
 * @param items - The draft's line items.
 * @param totals - The draft's totals, from {@link draftTotals}.
 * @returns `ok` with an empty message, or the first problem to fix.
 */
export function draftCompleteness(
  items: DraftItem[],
  totals: DraftTotals,
): { ok: boolean; message: string } {
  if (items.length === 0) return { ok: false, message: "add at least one item" };
  if (totals.itemsTotalCents <= 0) return { ok: false, message: "give the items a price" };
  const missing = unassignedCount(items);
  if (missing > 0) {
    return {
      ok: false,
      message: `${missing} item${missing === 1 ? "" : "s"} still need${missing === 1 ? "s" : ""} someone`,
    };
  }
  return { ok: true, message: "" };
}

/**
 * Turns API lines — a parsed receipt or a stored expense — into draft items.
 *
 * @param lines - Items as the API returned them.
 * @returns Editable draft rows with fresh client keys.
 */
export function draftItemsFromLines(lines: readonly ItemLine[], currency: string): DraftItem[] {
  return lines.map((line) => ({
    key: nextDraftKey(),
    name: line.name,
    quantity: line.quantity,
    total: centsToInput(line.totalCents, currency),
    assignees: Object.fromEntries((line.assignments ?? []).map((assignment) => [assignment.userId, true])),
  }));
}

/**
 * Builds the `items` array of a create/update request from a draft. Blank
 * names become "Item", matching what the server would store anyway, and
 * only checked assignees are sent.
 *
 * @param items - The draft's line items.
 * @returns Request items with empty ids (the server assigns them).
 */
export function itemsPayload(items: DraftItem[], currency: string) {
  return items.map((item) => ({
    id: "",
    name: item.name.trim() || "Item",
    quantity: item.quantity,
    totalCents: parseMoneyInput(item.total, currency) ?? 0,
    assignments: Object.entries(item.assignees)
      .filter(([, isAssigned]) => isAssigned)
      .map(([userId]) => ({ userId, weight: 1 })),
  }));
}
