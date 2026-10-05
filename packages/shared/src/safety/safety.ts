/** Safety choices and clear effects shared by both clients. */

/** Allowed report categories; server validates the same values. */
export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment or threats" },
  { value: "hate", label: "Hateful or abusive content" },
  { value: "sexual", label: "Sexual or graphic content" },
  { value: "spam", label: "Spam or fraud" },
  { value: "other", label: "Other safety concern" },
] as const;
/** Reportable resources visible to the caller. */
export const REPORT_TARGET_KINDS = ["comment", "expense", "group", "user"] as const;
/** Resource category in a report. */
export type ReportTargetKind = typeof REPORT_TARGET_KINDS[number];
/** Blocking never removes a debt or prevents access to financial history. */
export const BLOCK_EXPLANATION = "Blocking hides their comments and activity, stops direct requests and reminders, and prevents new expenses between you. Existing shared expenses and balances remain. You can unblock them in Account.";
