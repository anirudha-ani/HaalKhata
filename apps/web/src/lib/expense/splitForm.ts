/** Pure helpers for the expense form — validation + request assembly. */

import { parseMoneyInput } from "@haalkhata/shared/money/money";
import { computeItemizedSplits } from "@haalkhata/shared/expense/splits";

/** Split modes the form supports. */
export type FormSplitType = "equal" | "exact" | "percent" | "shares" | "itemized";

/**
 * One editable line item in the itemized split editor. `assignees` maps a user
 * id to that person's share weight for this item — 1 means an even share, 2
 * means a double share. A user id absent from the map is not on the item.
 */
export interface DraftLineItem {
  /** Stable React key; not sent to the server. */
  key: string;
  /** Item name as typed; blank falls back to "Item" on submit. */
  name: string;
  /** Raw money input for the item's own total (e.g. "12.50"). */
  total: string;
  /**
   * How many were bought. Only the receipt scanner reads this off the bill;
   * hand-entered items leave it undefined and it saves as 1. It scales
   * nothing — `total` is always the whole line, not the unit price.
   */
  quantity?: number;
  /** Share weight per assigned user id; every value is a positive integer. */
  assignees: Record<string, number>;
}

/** Snapshot of the split-relevant form state used for validation and payload assembly. */
export interface SplitFormState {
  /** Which split mode is active. */
  splitType: FormSplitType;
  /** Parsed expense total in cents, or null when the amount input is invalid. */
  totalCents: number | null;
  /** Checked participants, in display order. */
  participantIds: string[];
  /** Per-user raw input: exact → "12.50", percent → "25", shares → "2". */
  inputs: Record<string, string>;
}

/** Result of a validation check: `ok` plus a user-facing message when not ok. */
export interface SplitCheck {
  /** True when the check passed. */
  ok: boolean;
  /** Human-readable problem description; "" when the check passed. */
  message: string;
}

/**
 * Validates the split configuration: at least one participant, a valid total,
 * and — per split type — exact amounts summing to the total, percentages
 * summing to 100%, or a positive number of non-negative shares.
 *
 * @param state - The current split-relevant form state.
 * @returns Whether the split is valid, with a message when it is not.
 */
export function checkSplit(state: SplitFormState): SplitCheck {
  const { splitType, totalCents, participantIds, inputs } = state;
  // Itemized splits carry their own shape (line items, not a participant list
  // with per-person values) and are validated by checkItemized instead.
  if (splitType === "itemized") return { ok: true, message: "" };
  if (participantIds.length === 0) {
    return { ok: false, message: "pick at least one participant" };
  }
  if (totalCents === null || totalCents <= 0) {
    return { ok: false, message: "enter a valid amount" };
  }
  switch (splitType) {
    case "equal":
      return { ok: true, message: "" };
    case "exact": {
      const parsedCents = participantIds.map(
        (participantId) => parseMoneyInput(inputs[participantId] ?? "") ?? 0,
      );
      const assignedCents = parsedCents.reduce(
        (runningTotal, cents) => runningTotal + cents,
        0,
      );
      const remaining = totalCents - assignedCents;
      if (remaining !== 0) {
        return {
          ok: false,
          message: `${(Math.abs(remaining) / 100).toFixed(2)} ${remaining > 0 ? "left to assign" : "over the total"}`,
        };
      }
      return { ok: true, message: "" };
    }
    case "percent": {
      // Percentages are compared in basis points (percent × 100) to avoid float drift.
      const totalBasisPoints = participantIds.reduce(
        (runningTotal, participantId) =>
          runningTotal + Math.round((parseFloat(inputs[participantId] ?? "") || 0) * 100),
        0,
      );
      if (totalBasisPoints !== 10000) {
        return {
          ok: false,
          message: `percentages add up to ${(totalBasisPoints / 100).toFixed(1)}% (need 100%)`,
        };
      }
      return { ok: true, message: "" };
    }
    case "shares": {
      const shares = participantIds.map(
        (participantId) => parseInt(inputs[participantId] ?? "", 10) || 0,
      );
      if (shares.some((shareCount) => shareCount < 0)) {
        return { ok: false, message: "shares cannot be negative" };
      }
      if (shares.reduce((runningTotal, shareCount) => runningTotal + shareCount, 0) <= 0) {
        return { ok: false, message: "give at least one share" };
      }
      return { ok: true, message: "" };
    }
  }
}

/**
 * Builds the SplitSpec payload for the API from raw form inputs.
 *
 * @param state - The current split-relevant form state (assumed already valid).
 * @returns One spec per participant, with only the field relevant to the
 *   active split type populated (amountCents, percentBp, or shares).
 */
export function buildSplitSpecs(state: SplitFormState) {
  // Destructured to a local const so the itemized narrowing below still holds
  // inside the map callback (a property access would widen again).
  const { splitType, participantIds, inputs } = state;
  // Itemized expenses derive their splits server-side from the line items;
  // no per-person specs are sent.
  if (splitType === "itemized") return [];
  return participantIds.map((userId) => {
    switch (splitType) {
      case "equal":
        return { userId, amountCents: 0, percentBp: 0, shares: 0 };
      case "exact":
        return {
          userId,
          amountCents: parseMoneyInput(inputs[userId] ?? "") ?? 0,
          percentBp: 0,
          shares: 0,
        };
      case "percent":
        return {
          userId,
          amountCents: 0,
          percentBp: Math.round((parseFloat(inputs[userId] ?? "") || 0) * 100),
          shares: 0,
        };
      case "shares":
        return {
          userId,
          amountCents: 0,
          percentBp: 0,
          shares: parseInt(inputs[userId] ?? "", 10) || 0,
        };
    }
  });
}

/**
 * Sums an itemized draft into the totals the form displays and submits. The
 * server recomputes this same figure from the items it receives and rejects a
 * mismatch, so the two must agree exactly.
 *
 * @param items - The draft line items.
 * @param taxCents - Tax in integer cents.
 * @param tipCents - Tip in integer cents.
 * @returns The items subtotal and the grand total (items + tax + tip), in cents.
 */
export function itemizedTotals(
  items: DraftLineItem[],
  taxCents: number,
  tipCents: number,
): { itemsTotalCents: number; totalCents: number } {
  const itemsTotalCents = items.reduce(
    (runningTotal, item) => runningTotal + (parseMoneyInput(item.total) ?? 0),
    0,
  );
  return { itemsTotalCents, totalCents: itemsTotalCents + taxCents + tipCents };
}

/**
 * Validates an itemized draft: at least one line item, every item priced and
 * assigned to somebody, and a positive items subtotal. Mirrors the server's
 * `computeItemizedSplits` guards so the form fails fast with a friendlier
 * message instead of round-tripping.
 *
 * @param items - The draft line items.
 * @returns Whether the draft is valid, with a message when it is not.
 */
export function checkItemized(items: DraftLineItem[]): SplitCheck {
  if (items.length === 0) return { ok: false, message: "add at least one item" };

  const unpriced = items.filter((item) => (parseMoneyInput(item.total) ?? 0) <= 0).length;
  if (unpriced > 0) {
    return {
      ok: false,
      message: `${unpriced} item${unpriced === 1 ? "" : "s"} need${unpriced === 1 ? "s" : ""} an amount`,
    };
  }

  const unassigned = items.filter(
    (item) => Object.values(item.assignees).filter((weight) => weight > 0).length === 0,
  ).length;
  if (unassigned > 0) {
    return {
      ok: false,
      message: `${unassigned} item${unassigned === 1 ? " is" : "s are"} unassigned`,
    };
  }

  if (itemizedTotals(items, 0, 0).itemsTotalCents <= 0) {
    return { ok: false, message: "items must add up to a positive amount" };
  }
  return { ok: true, message: "" };
}

/**
 * Builds the ExpenseItem payload for the API from an itemized draft, dropping
 * assignees whose weight is zero and defaulting a blank name to "Item".
 *
 * @param items - The draft line items (assumed already valid).
 * @returns One API item per draft row, each with its positive-weight assignments.
 */
export function buildItemsPayload(items: DraftLineItem[]) {
  return items.map((item) => ({
    id: "",
    name: item.name.trim() || "Item",
    quantity: Math.max(1, item.quantity ?? 1),
    totalCents: parseMoneyInput(item.total) ?? 0,
    assignments: Object.entries(item.assignees)
      .filter(([, weight]) => weight > 0)
      .map(([userId, weight]) => ({ userId, weight })),
  }));
}

/**
 * Computes what each person owes for an itemized draft, for the live preview
 * row under the grid.
 *
 * This calls the very same `computeItemizedSplits` the server uses, so the
 * previewed figures are the figures that will be saved — no second
 * implementation of cent-exact allocation to drift out of sync. An incomplete
 * draft (no items, nothing assigned yet) simply previews nothing.
 *
 * @param items - The draft line items.
 * @param taxCents - Tax in integer cents.
 * @param tipCents - Tip in integer cents.
 * @returns Owed cents keyed by user id; empty while the draft is incomplete.
 */
export function previewItemizedShares(
  items: DraftLineItem[],
  taxCents: number,
  tipCents: number,
): Record<string, number> {
  try {
    const { splits } = computeItemizedSplits(buildItemsPayload(items), taxCents, tipCents);
    return Object.fromEntries(splits.map((split) => [split.userId, split.owedCents]));
  } catch {
    // Draft not complete enough to allocate yet — checkItemized surfaces why.
    return {};
  }
}

/**
 * Validates the "paid by" configuration in multi-payer mode: at least one
 * positive amount, and the amounts summing exactly to the expense total.
 * Single-payer mode always passes.
 *
 * @param totalCents - Parsed expense total in cents, or null when invalid.
 * @param multiPayer - Whether multi-payer mode is enabled.
 * @param payerAmounts - Raw per-user paid-amount inputs, keyed by user id.
 * @returns Whether the payers are valid, with a message when they are not.
 */
export function checkPayers(
  totalCents: number | null,
  multiPayer: boolean,
  payerAmounts: Record<string, string>,
): SplitCheck {
  if (!multiPayer) return { ok: true, message: "" };
  if (totalCents === null) return { ok: false, message: "enter a valid amount" };
  const paidCents = Object.values(payerAmounts)
    .map((value) => parseMoneyInput(value) ?? 0)
    .filter((cents) => cents > 0);
  if (paidCents.length === 0) return { ok: false, message: "enter who paid what" };
  const paidTotalCents = paidCents.reduce((runningTotal, cents) => runningTotal + cents, 0);
  if (paidTotalCents !== totalCents) {
    const differenceCents = totalCents - paidTotalCents;
    return {
      ok: false,
      message: `payments ${differenceCents > 0 ? "short" : "over"} by ${(Math.abs(differenceCents) / 100).toFixed(2)}`,
    };
  }
  return { ok: true, message: "" };
}
