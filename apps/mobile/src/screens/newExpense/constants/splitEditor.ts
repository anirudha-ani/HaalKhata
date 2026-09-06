/** New-expense-route constants: split editor tabs and units. */

import type { FormSplitType } from "../utils/splitForm";

/** The selectable split-type tabs, in display order. */
export const SPLIT_TABS: { value: FormSplitType; label: string }[] = [
  { value: "equal", label: "Equally" },
  { value: "exact", label: "Amounts" },
  { value: "percent", label: "Percent" },
  { value: "shares", label: "Shares" },
  { value: "itemized", label: "Items" },
];

/** Suffix rendered after each per-person value input, per split type. */
export const UNIT: Record<FormSplitType, string> = {
  equal: "",
  exact: "",
  percent: "%",
  shares: "×",
  itemized: "",
};
