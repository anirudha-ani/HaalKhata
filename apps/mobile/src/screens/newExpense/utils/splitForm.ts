/** Pure helpers for the expense form — validation + request assembly. */

import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";

/**
 * Split modes the form supports. "itemized" is validated by the item draft
 * (every line priced and assigned) rather than by {@link checkSplit}, and
 * sends no split specs — the server derives the splits from the items.
 */
export type FormSplitType = "equal" | "exact" | "percent" | "shares" | "itemized";

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
  /** ISO 4217 code money inputs are typed in; sets the decimals they allow (§36). */
  currency: string;
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
  if (participantIds.length === 0) {
    return { ok: false, message: "pick at least one participant" };
  }
  if (totalCents === null || totalCents <= 0) {
    return { ok: false, message: "enter a valid amount" };
  }
  switch (splitType) {
    case "equal":
    case "itemized":
      return { ok: true, message: "" };
    case "exact": {
      const parsedCents = participantIds.map(
        (participantId) => parseMoneyInput(inputs[participantId] ?? "", state.currency) ?? 0,
      );
      const assignedCents = parsedCents.reduce(
        (runningTotal, cents) => runningTotal + cents,
        0,
      );
      const remaining = totalCents - assignedCents;
      if (remaining !== 0) {
        return {
          ok: false,
          message: `${centsToInput(Math.abs(remaining), state.currency)} ${remaining > 0 ? "left to assign" : "over the total"}`,
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
  // Itemized splits are computed by the server from the items and their
  // assignments; there is nothing per-participant to send.
  if (state.splitType === "itemized") return [];
  // Read once so the narrowing above survives into the callback below.
  const splitType = state.splitType;
  return state.participantIds.map((userId) => {
    switch (splitType) {
      case "equal":
        return { userId, amountCents: 0, percentBp: 0, shares: 0 };
      case "exact":
        return {
          userId,
          amountCents: parseMoneyInput(state.inputs[userId] ?? "", state.currency) ?? 0,
          percentBp: 0,
          shares: 0,
        };
      case "percent":
        return {
          userId,
          amountCents: 0,
          percentBp: Math.round((parseFloat(state.inputs[userId] ?? "") || 0) * 100),
          shares: 0,
        };
      case "shares":
        return {
          userId,
          amountCents: 0,
          percentBp: 0,
          shares: parseInt(state.inputs[userId] ?? "", 10) || 0,
        };
    }
  });
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
  currency: string,
): SplitCheck {
  if (!multiPayer) return { ok: true, message: "" };
  if (totalCents === null) return { ok: false, message: "enter a valid amount" };
  const paidCents = Object.values(payerAmounts)
    .map((value) => parseMoneyInput(value, currency) ?? 0)
    .filter((cents) => cents > 0);
  if (paidCents.length === 0) return { ok: false, message: "enter who paid what" };
  const paidTotalCents = paidCents.reduce((runningTotal, cents) => runningTotal + cents, 0);
  if (paidTotalCents !== totalCents) {
    const differenceCents = totalCents - paidTotalCents;
    return {
      ok: false,
      message: `payments ${differenceCents > 0 ? "short" : "over"} by ${centsToInput(Math.abs(differenceCents), currency)}`,
    };
  }
  return { ok: true, message: "" };
}
