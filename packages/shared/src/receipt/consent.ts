/** Receipt permission wording shared by browser and native screens. */

/** First-use prompt and account controls; permission covers future user-initiated scans. */
export const RECEIPT_CONSENT_COPY = {
  offline: "You are offline. Reconnect before changing permission or scanning a receipt.",
  title: "Allow AI receipt scanning?",
  allow: "Allow AI scanning",
  decline: "Enter manually",
  remember: "Applies to future scans on this account. Turn it off anytime in Account.",
  settingTitle: "AI receipt scanning",
  enabled: "Allowed for this account on web and mobile.",
  disabled: "Permission is off. We will ask before your next AI scan. Manual entry is always available.",
  withdraw: "Withdraw permission",
  withdrawn: "Permission withdrawn. Future AI scans will ask again.",
} as const;
