/** Safe restoration of persisted splits when the original ratio inputs were not stored. */
import { centsToInput } from "../../money/money";
import type { FormSplitType } from "./splitForm";

/**
 * Restores editable inputs without inventing percentages or weights from rounded
 * allocations. Older expenses store final amounts only, so ratio-based splits
 * reopen explicitly as Exact; users may select a new ratio mode themselves.
 * @param splitType - Saved split mode.
 * @param splits - Persisted per-person minor-unit amounts.
 * @param currency - Saved expense currency.
 * @returns Editable mode, input values and an explanation when the mode changed.
 */
export function restoreExpenseSplit(
  splitType: string,
  splits: readonly { userId: string; owedCents: number }[],
  currency: string,
): { splitType: FormSplitType; splitInputs: Record<string, string>; splitNotice: string } {
  const needsExact = splitType === "percent" || splitType === "shares";
  const restoredType = needsExact ? "exact" : splitType as FormSplitType;
  return {
    splitType: restoredType,
    splitInputs: restoredType === "exact"
      ? Object.fromEntries(splits.map((split) => [split.userId, centsToInput(split.owedCents, currency)]))
      : {},
    splitNotice: needsExact
      ? "Your saved per-person amounts are shown in Amounts to keep each share unchanged. Choose Percent or Shares to enter a new split."
      : "",
  };
}
