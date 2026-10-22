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

/**
 * Wording of the report and block dialogs in both apps. Each dialog asks,
 * then — once the server has accepted — says so in the same place, so the
 * confirmation is read where the person is looking rather than beside a
 * control the dialog may have been opened from far away (a header menu
 * stays put while the page under it scrolls).
 */
export const SAFETY_DIALOG_COPY = {
  report: {
    title: "Report a safety concern",
    prompt: "Choose a reason. The person you report is not notified. Contact Support for urgent help.",
    confirm: "Send report",
    doneTitle: "Report sent",
    done: "Report received. Our support team will review it. Your report is private.",
  },
  block: {
    title: "Block this person?",
    prompt: BLOCK_EXPLANATION,
    confirm: "Confirm block",
    doneTitle: "Person blocked",
    done: "Person blocked. Manage blocked people in Account.",
  },
} as const;

/** Which safety dialog is open: reporting the target, or blocking a person. */
export type SafetyDialogMode = keyof typeof SAFETY_DIALOG_COPY;
