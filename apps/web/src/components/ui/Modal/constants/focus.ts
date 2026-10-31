/** What a keyboard can land on inside a dialog. */

/** Everything Tab can reach, in the browser's own terms. */
export const TABBABLE_CONTROLS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
