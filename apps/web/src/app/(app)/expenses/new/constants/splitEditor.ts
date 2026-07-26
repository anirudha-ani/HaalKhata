/** New-expense-route constants: split editor tabs and units. */

import type { FormSplitType } from "../utils/splitForm";

/** The selectable split-type tabs, in display order. */
export const SPLIT_TABS: { value: FormSplitType; label: string }[] = [
  { value: "equal", label: "Equally" },
  { value: "exact", label: "Amounts" },
  { value: "percent", label: "Percent" },
  { value: "shares", label: "Shares" },
  { value: "itemized", label: "Itemized" },
];

/**
 * Upper bound for a person's share weight on a single line item. Keeps the
 * stepper from running away; the server accepts any positive weight.
 */
export const MAX_ASSIGNEE_WEIGHT = 99;

/** One-tap tip percentages offered under the itemized grid, of the items subtotal. */
export const TIP_PERCENT_PRESETS = [10, 15, 18, 20];

/** Suffix rendered after each per-person value input, per split type. */
export const UNIT: Record<FormSplitType, string> = {
  equal: "",
  exact: "",
  percent: "%",
  shares: "×",
  itemized: "",
};
