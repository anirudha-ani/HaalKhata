/** Pure split math: equal/exact/percent/shares and itemized receipts, always reconciling to the total. */

import { allocate } from "./allocate";
import { MAX_ASSIGNMENT_WEIGHT } from "./live/live.constants";

/** Thrown when a split request is malformed (bad sums, duplicates, empty or negative input). */
export class SplitError extends Error {}

/** One participant's share request; which field matters depends on the split type. */
export interface SplitSpecInput {
  userId: string;
  /** Exact amount owed in cents — used only by the "exact" split type. */
  amountCents?: number;
  /** Percentage in basis points (1 bp = 0.01%, so 10000 = 100%) — used only by "percent". */
  percentBp?: number;
  /** Relative share count (2 shares owe twice as much as 1) — used only by "shares". */
  shares?: number;
}

/** Final computed amount one participant owes for an expense. */
export interface ComputedSplit {
  userId: string;
  owedCents: number;
}

/** One receipt line item and the people it is assigned to. */
export interface ItemInput {
  name: string;
  totalCents: number;
  /**
   * Who consumed this item; `weight` sets each person's relative portion of it.
   * Weights are integer ratios (the DB column and proto field are both
   * integer): a 2:1 split is expressed as weight 2 and 1, never 0.5 and 0.25.
   * `allocate()` treats them as float ratios internally, but callers should
   * pass whole numbers to stay faithful to the stored schema.
   */
  assignments: { userId: string; weight: number }[];
}

/**
 * The largest common whole number of two amounts.
 *
 * @param first - One amount.
 * @param second - The other.
 * @returns Their greatest common divisor; 0 only when both are 0.
 */
function commonDivisor(first: number, second: number): number {
  return second === 0 ? Math.abs(first) : commonDivisor(second, first % second);
}

/**
 * Portions of a line for the people who paid, in proportion to what each
 * paid: someone who paid $60 of $100 carries three parts to the other's two.
 * That is what stops a second card creating a debt by itself: while a line is
 * unclaimed, everybody who paid carries what they paid. Portions are saved in
 * a column of ordinary integers, so an enormous, unround bill comes out close
 * to its proportions rather than exactly on them.
 *
 * @param payers - Who paid, and how much.
 * @returns One portion per payer, by id.
 */
export function payerWeights(payers: readonly { userId: string; amountCents: number }[]) {
  const sorted = [...payers].sort((first, second) => first.userId.localeCompare(second.userId));
  const divisor = sorted.reduce((running, payer) => commonDivisor(running, payer.amountCents), 0) || 1;
  const largest = Math.max(...sorted.map((payer) => payer.amountCents / divisor), 1);
  const scale = Math.min(1, MAX_ASSIGNMENT_WEIGHT / largest);
  return sorted.map((payer) => ({
    userId: payer.userId,
    weight: Math.max(1, Math.round((payer.amountCents / divisor) * scale)),
  }));
}

/**
 * Puts every line nobody has claimed on whoever paid, by what each paid: while
 * a live split runs, the bill is theirs until somebody says otherwise, so the
 * ledger is exact before anyone has claimed anything.
 *
 * @param items - The receipt's lines.
 * @param payers - Who paid, and how much.
 * @returns The lines to work shares out from.
 */
export function unclaimedOnPayers<Item extends ItemInput>(
  items: readonly Item[],
  payers: readonly { userId: string; amountCents: number }[],
): Item[] {
  const assignments = payerWeights(payers);
  return items.map((item) => (item.assignments.length > 0 ? item : { ...item, assignments }));
}

/**
 * Itemized shares where a line may have nobody on it. Rounding line by line
 * could leave somebody a cent short of what they paid, so while nobody has
 * claimed anything each person's share is simply what they paid: a second
 * card puts nobody in debt, not even by a cent.
 *
 * @param items - The receipt's lines.
 * @param taxCents - Tax on the bill.
 * @param tipCents - Tip on the bill.
 * @param payers - Who paid, and how much.
 * @returns Each person's share and the bill's total.
 * @throws SplitError for the reasons {@link computeItemizedSplits} does.
 */
export function computeUnclaimedSplits(
  items: readonly ItemInput[],
  taxCents: number,
  tipCents: number,
  payers: readonly { userId: string; amountCents: number }[],
): { splits: ComputedSplit[]; totalCents: number } {
  const computed = computeItemizedSplits(unclaimedOnPayers(items, payers), taxCents, tipCents);
  const paidCents = payers.reduce((running, payer) => running + payer.amountCents, 0);
  if (paidCents !== computed.totalCents || items.some((item) => item.assignments.length > 0)) return computed;
  return { ...computed, splits: payers.map((payer) => ({ userId: payer.userId, owedCents: payer.amountCents })) };
}

/**
 * Ensures no user id appears twice in a participant list.
 *
 * @param userIds - Participant ids to check.
 * @throws SplitError if any id is duplicated.
 */
function assertUnique(userIds: string[]): void {
  if (new Set(userIds).size !== userIds.length) {
    throw new SplitError("duplicate participants in split");
  }
}

/**
 * Computes what each participant owes for a non-itemized expense.
 *
 * Split types:
 * - "equal": the total is divided evenly, remainder cents spread deterministically.
 * - "exact": each spec's `amountCents` is used verbatim; they must sum to the total.
 * - "percent": proportional to `percentBp` (basis points), which must sum to 10000 (100%).
 * - "shares": proportional to each spec's `shares` count.
 *
 * All proportional types use largest-remainder allocation, so the result
 * always sums to exactly `totalCents`.
 *
 * @param splitType - One of "equal" | "exact" | "percent" | "shares".
 * @param totalCents - Expense total in integer cents; must be positive.
 * @param specs - One entry per participant carrying the field relevant to `splitType`.
 * @returns One `ComputedSplit` per spec, in the same order as `specs`.
 * @throws SplitError on an unknown split type, empty or duplicate participants,
 *   a non-positive total, or per-type violations (bad sums, negative amounts/shares).
 */
export function computeSplits(
  splitType: string,
  totalCents: number,
  specs: SplitSpecInput[],
): ComputedSplit[] {
  if (specs.length === 0) throw new SplitError("at least one participant required");
  if (totalCents <= 0) throw new SplitError("amount must be positive");
  assertUnique(specs.map((spec) => spec.userId));

  switch (splitType) {
    case "equal": {
      const owedAmounts = allocate(totalCents, specs.map(() => 1));
      return specs.map((spec, index) => ({ userId: spec.userId, owedCents: owedAmounts[index] }));
    }
    case "exact": {
      const exactSum = specs.reduce((runningTotal, spec) => runningTotal + (spec.amountCents ?? 0), 0);
      if (exactSum !== totalCents) {
        throw new SplitError(`exact amounts must sum to the total (${exactSum} != ${totalCents})`);
      }
      if (specs.some((spec) => (spec.amountCents ?? 0) < 0)) {
        throw new SplitError("exact amounts must be non-negative");
      }
      return specs.map((spec) => ({ userId: spec.userId, owedCents: spec.amountCents ?? 0 }));
    }
    case "percent": {
      if (specs.some((spec) => (spec.percentBp ?? 0) < 0)) {
        throw new SplitError("percentages must be non-negative");
      }
      const basisPointSum = specs.reduce((runningTotal, spec) => runningTotal + (spec.percentBp ?? 0), 0);
      if (basisPointSum !== 10000) {
        throw new SplitError(`percentages must sum to 100% (got ${basisPointSum / 100}%)`);
      }
      const owedAmounts = allocate(totalCents, specs.map((spec) => spec.percentBp ?? 0));
      return specs.map((spec, index) => ({ userId: spec.userId, owedCents: owedAmounts[index] }));
    }
    case "shares": {
      if (specs.some((spec) => (spec.shares ?? 0) < 0)) {
        throw new SplitError("shares must be non-negative");
      }
      if (specs.reduce((runningTotal, spec) => runningTotal + (spec.shares ?? 0), 0) === 0) {
        throw new SplitError("at least one share required");
      }
      const owedAmounts = allocate(totalCents, specs.map((spec) => spec.shares ?? 0));
      return specs.map((spec, index) => ({ userId: spec.userId, owedCents: owedAmounts[index] }));
    }
    default:
      throw new SplitError(`unknown split type "${splitType}"`);
  }
}

/**
 * Each person's cents of one item, always in order of user id. An item's odd
 * cent goes by position, and nothing stores the order people were added in:
 * two forms list them differently and the database returns them in any order.
 * So the order is fixed here, or saving an unchanged expense could move a cent.
 *
 * @param item - The receipt item, with its assignments and weights.
 * @returns One share per person.
 */
function shareOutItem(item: ItemInput): { userId: string; cents: number }[] {
  const people = [...item.assignments].sort((first, second) => (first.userId < second.userId ? -1 : 1));
  const shares = allocate(item.totalCents, people.map((assignment) => assignment.weight));
  return people.map((assignment, index) => ({ userId: assignment.userId, cents: shares[index] }));
}

/**
 * Itemized split: each person owes the weighted share of their assigned
 * items, plus tax + tip split proportionally to their item subtotal.
 *
 * Every division (within an item and for tax + tip) uses largest-remainder
 * allocation, so the returned splits sum exactly to items total + tax + tip
 * — that sum is also returned as the authoritative expense total.
 *
 * @param items - Receipt line items with per-person assignment weights.
 * @param taxCents - Tax in integer cents, divided proportionally to each person's item subtotal.
 * @param tipCents - Tip in integer cents, divided the same way as tax.
 * @returns The per-person splits and the authoritative `totalCents` they sum to.
 * @throws SplitError on an empty item list, an item with no assignees, negative
 *   amounts, non-positive weights, duplicate assignees on one item, or a
 *   non-positive items total.
 */
/**
 * One person's share of a single receipt item, before tax and tip.
 *
 * The same sharing out `computeItemizedSplits` does per item, so the number
 * shown against a line matches the one that fed the stored split exactly —
 * including which cent the largest-remainder rounding handed to whom.
 * Recomputing it as `total / count` would be right most of the time and
 * quietly wrong on the rows people query.
 *
 * Tax and tip are deliberately excluded: they are allocated once, in
 * proportion to each person's whole subtotal, so there is no honest per-item
 * figure for them. The difference between this and the split panel's total is
 * exactly that allocation.
 *
 * @param item - The receipt item, with its assignments and weights.
 * @param userId - Whose share to compute.
 * @returns The share in cents, or null when that person is not on the item.
 */
export function itemShareCents(item: ItemInput, userId: string): number | null {
  return shareOutItem(item).find((share) => share.userId === userId)?.cents ?? null;
}

export function computeItemizedSplits(
  items: ItemInput[],
  taxCents: number,
  tipCents: number,
): { splits: ComputedSplit[]; totalCents: number } {
  if (items.length === 0) throw new SplitError("itemized split needs at least one item");
  if (taxCents < 0 || tipCents < 0) throw new SplitError("tax/tip must be non-negative");

  const subtotals = new Map<string, number>();
  for (const item of items) {
    if (item.totalCents < 0) throw new SplitError(`item "${item.name}" has a negative amount`);
    if (item.assignments.length === 0) {
      throw new SplitError(`item "${item.name}" is not assigned to anyone`);
    }
    assertUnique(item.assignments.map((assignment) => assignment.userId));
    if (item.assignments.some((assignment) => assignment.weight <= 0)) {
      throw new SplitError(`item "${item.name}" has a non-positive assignment weight`);
    }
    for (const share of shareOutItem(item)) {
      subtotals.set(share.userId, (subtotals.get(share.userId) ?? 0) + share.cents);
    }
  }

  const userIds = [...subtotals.keys()].sort();
  const itemsTotal = items.reduce((runningTotal, item) => runningTotal + item.totalCents, 0);
  if (itemsTotal <= 0) throw new SplitError("items must add up to a positive amount");

  // Tax + tip proportional to each person's item subtotal.
  const taxAndTipShares = allocate(
    taxCents + tipCents,
    userIds.map((userId) => subtotals.get(userId)!),
  );
  const splits = userIds.map((userId, index) => ({
    userId,
    owedCents: subtotals.get(userId)! + taxAndTipShares[index],
  }));
  return { splits, totalCents: itemsTotal + taxCents + tipCents };
}
