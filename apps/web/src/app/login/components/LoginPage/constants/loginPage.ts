/** Presentation constants for the combined HaalKhata marketing and login page. */

/** Shared styling for each credential field on the login form. */
export const LOGIN_INPUT_CLASS =
  "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-[15px] text-ink shadow-[0_1px_0_rgba(41,34,23,0.02)] outline-none transition-[border-color,box-shadow] placeholder:text-ink-soft/70 focus:border-brand-500 focus:ring-4 focus:ring-brand-100";

/** Example expenses shown in the animated trip-ledger product preview. */
export const SAMPLE_EXPENSES = [
  { title: "Yosemite cabin", payer: "Dot paid", amount: "$240.00", delayClass: "delayOne" },
  { title: "Trail groceries", payer: "Oni paid", amount: "$120.00", delayClass: "delayTwo" },
  { title: "Park passes", payer: "PZ paid", amount: "$60.00", delayClass: "delayThree" },
] as const;

/** Example friends and their avatar colors in the animated product preview. */
export const SAMPLE_PARTICIPANTS = [
  { initials: "ON", colorClass: "bg-brand-600 text-white" },
  { initials: "DO", colorClass: "bg-pos-600 text-white" },
  { initials: "PZ", colorClass: "bg-neg-600 text-white" },
  { initials: "JE", colorClass: "bg-ink text-white" },
] as const;
