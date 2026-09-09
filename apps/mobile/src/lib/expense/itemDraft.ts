/** Pure helpers for an itemized-expense draft: totals, completeness, previews, and conversion to/from the API. */

import { centsToInput, formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";
import { nextDraftKey } from "@haalkhata/shared/expense/draftKey";
import { computeItemizedSplits } from "@haalkhata/shared/expense/splits";

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
  /**
   * Portion count per user id: 1 is an ordinary share, 2 is two portions
   * against everyone else's one. Absent or 0 means "not on this item".
   */
  assignees: Record<string, number>;
}

/** A line as the API speaks it: a parsed receipt item or a stored expense item. */
export interface ItemLine {
  name: string;
  quantity: number;
  totalCents: number;
  /** Who shares it and by how many portions; absent on a freshly parsed receipt. */
  assignments?: readonly { userId: string; weight?: number }[];
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
 * @param currency - ISO 4217 code the amounts are typed in.
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
 * Whether anyone is on a line.
 *
 * @param item - The line to check.
 * @returns True when at least one person holds a positive portion count.
 */
export function isAssigned(item: DraftItem): boolean {
  return Object.values(item.assignees).some((weight) => weight > 0);
}

/**
 * Counts the items nobody has been assigned to yet.
 *
 * @param items - The draft's line items.
 * @returns How many items still need at least one person.
 */
export function unassignedCount(items: DraftItem[]): number {
  return items.filter((item) => !isAssigned(item)).length;
}

/**
 * Says whether a draft can be saved, and if not, what is missing, in the
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
 * Describes what still needs doing before an itemized bill adds up: the money
 * on lines nobody is on, and the count of lines with no usable amount. Reads
 * the draft with the same rules the submit check applies, so the summary
 * never says "everything is assigned" while the save button disagrees.
 *
 * @param items - The draft's line items.
 * @param currency - ISO 4217 code the amounts are typed in.
 * @returns Zero, one or two short sentences, unassigned money first.
 */
export function itemizedWarnings(items: DraftItem[], currency: string): string[] {
  let unassignedCents = 0;
  let missingAmounts = 0;
  for (const item of items) {
    const cents = parseMoneyInput(item.total, currency);
    if (cents === null || cents <= 0) {
      missingAmounts += 1;
      continue;
    }
    if (!isAssigned(item)) unassignedCents += cents;
  }
  const warnings: string[] = [];
  if (unassignedCents > 0) warnings.push(`${formatMoney(unassignedCents, currency)} unassigned`);
  if (missingAmounts > 0) {
    const plural = missingAmounts === 1 ? "" : "s";
    const verb = missingAmounts === 1 ? "needs" : "need";
    warnings.push(`${missingAmounts} item${plural} ${verb} an amount`);
  }
  return warnings;
}

/**
 * What tax or tip works out to as a rate on the items subtotal. A bare
 * "8.40" says nothing about whether it is the tax you expected; "8.9% of
 * items" does.
 *
 * @param cents - The tax or tip amount in cents.
 * @param itemsTotalCents - The items subtotal in cents.
 * @returns The percentage to one decimal place with a trailing ".0" trimmed
 *   ("18%", "8.9%"), or "" when there is nothing meaningful to show.
 */
export function percentOfItems(cents: number, itemsTotalCents: number): string {
  if (cents <= 0 || itemsTotalCents <= 0) return "";
  const percent = (cents / itemsTotalCents) * 100;
  return `${percent.toFixed(1).replace(/\.0$/, "")}%`;
}

/**
 * Previews what each person owes for the draft through the same allocator
 * the server runs, so the summary is exactly what gets saved. Empty until
 * the draft can be allocated; {@link draftCompleteness} says why.
 *
 * @param items - The draft's line items.
 * @param taxCents - Tax in cents.
 * @param tipCents - Tip in cents.
 * @param currency - ISO 4217 code the amounts are typed in.
 * @returns Owed cents by user id, or an empty record while the draft is incomplete.
 */
export function previewItemizedShares(
  items: DraftItem[],
  taxCents: number,
  tipCents: number,
  currency: string,
): Record<string, number> {
  try {
    const { splits } = computeItemizedSplits(itemsPayload(items, currency), taxCents, tipCents);
    return Object.fromEntries(splits.map((split) => [split.userId, split.owedCents]));
  } catch {
    return {};
  }
}

/**
 * Turns API lines, a parsed receipt or a stored expense, into draft items.
 * A stored assignment keeps its portion count; one without a weight (an
 * older row, or a freshly parsed receipt) is a single portion.
 *
 * @param lines - Items as the API returned them.
 * @param currency - ISO 4217 code the amounts are shown in.
 * @returns Editable draft rows with fresh client keys.
 */
export function draftItemsFromLines(lines: readonly ItemLine[], currency: string): DraftItem[] {
  return lines.map((line) => ({
    key: nextDraftKey(),
    name: line.name,
    quantity: line.quantity,
    total: centsToInput(line.totalCents, currency),
    assignees: Object.fromEntries(
      (line.assignments ?? []).map((assignment) => [
        assignment.userId,
        assignment.weight && assignment.weight > 0 ? assignment.weight : 1,
      ]),
    ),
  }));
}

/**
 * Builds the `items` array of a create/update request from a draft. Blank
 * names become "Item", matching what the server would store anyway, and
 * only people with a positive portion count are sent, with that count as
 * their weight.
 *
 * @param items - The draft's line items.
 * @param currency - ISO 4217 code the amounts are typed in.
 * @returns Request items with empty ids (the server assigns them).
 */
export function itemsPayload(items: DraftItem[], currency: string) {
  return items.map((item) => ({
    id: "",
    name: item.name.trim() || "Item",
    quantity: item.quantity,
    totalCents: parseMoneyInput(item.total, currency) ?? 0,
    assignments: Object.entries(item.assignees)
      .filter(([, weight]) => weight > 0)
      .map(([userId, weight]) => ({ userId, weight })),
  }));
}
