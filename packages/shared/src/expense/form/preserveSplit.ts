/** Preserve historical ratio modes only when their saved allocations remain identical. */

/** Financial snapshot needed to compare a saved split with an edited draft. */
export interface SplitSnapshot {
  splitType: string;
  amountCents: number;
  currency: string;
  groupId: string;
  splits: readonly { userId: string; owedCents: number }[];
}

/**
 * Allows metadata/payer edits without relabeling historical percentage/share splits.
 * Original ratios cannot be reconstructed from rounded amounts. Any allocation,
 * participant, total, currency or scope change needs a fresh explicit split.
 * @param saved Stored expense snapshot, absent for a new expense.
 * @param draft Validated allocations or the client's exact-amount draft.
 * @returns Whether retaining the original split mode leaves its allocations untouched.
 */
export function canPreserveSplitType(saved: SplitSnapshot | undefined, draft: SplitSnapshot): boolean {
  if (!saved || !["percent", "shares"].includes(saved.splitType) || draft.splitType !== "exact" ||
    saved.amountCents !== draft.amountCents || saved.currency !== draft.currency || saved.groupId !== draft.groupId ||
    saved.splits.length !== draft.splits.length) return false;
  const allocations = new Map(saved.splits.map((split) => [split.userId, split.owedCents]));
  const participants = new Set(draft.splits.map((split) => split.userId));
  return participants.size === draft.splits.length && draft.splits.every((split) => allocations.get(split.userId) === split.owedCents);
}
