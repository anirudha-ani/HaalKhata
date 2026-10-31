/** Pure helpers for an itemized-expense draft: totals, completeness, previews, and conversion to/from the API. */

import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import { nextDraftKey } from "@haalkhata/shared/expense/draftKey";
import { checkItemized, itemizedTotals, type DraftLineItem } from "@haalkhata/shared/expense/form/splitForm";

/** Native editor rows always have an explicit quantity, even before saving. */
export interface DraftItem extends DraftLineItem {
  /** How many were bought; total remains the whole line price. */
  quantity: number;
}

/** A line as the API speaks it: a parsed receipt item or a stored expense item. */
export interface ItemLine {
  /** The saved line this is; absent on a freshly parsed receipt. */
  id?: string;
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
  const taxCents = parseMoneyInput(taxInput, currency) ?? 0;
  const tipCents = parseMoneyInput(tipInput, currency) ?? 0;
  const totals = itemizedTotals(items, taxCents, tipCents, currency);
  return { itemsTotalCents: totals.itemsTotalCents, taxCents, tipCents, grandTotalCents: totals.totalCents };
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
 * @param currency - Currency used to validate every individual line.
 * @param allowUnclaimed - A line may have nobody on it: a live split is running on this bill.
 * @returns `ok` with an empty message, or the first problem to fix.
 */
export function draftCompleteness(items: DraftItem[], currency: string, allowUnclaimed = false) {
  return checkItemized(items, currency, allowUnclaimed);
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
    id: line.id || undefined,
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
