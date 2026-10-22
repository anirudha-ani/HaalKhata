/**
 * The signed-out story both apps tell before sign-in: what HaalKhata is, the
 * three steps it takes, and the line above the sign-in buttons. The web
 * lays it out as a landing page; the iPhone and iPad app as a welcome
 * screen with the steps in a pager. One wording, so the two never drift.
 */

/** The headline promise. The accent half is set in the brand color. */
export const WELCOME_HERO = {
  eyebrow: "Shared expenses, minus the spreadsheet",
  titleLead: "Stop being the",
  titleAccent: "group accountant.",
  body:
    "HaalKhata turns receipts, group expenses, and those “wait, who paid?” moments into one calm ledger, " +
    "itemized, exact, and easy to settle.",
} as const;

/** One step of "what to expect". */
export interface WelcomeStep {
  /** Two-digit position, shown before the title. */
  number: string;
  title: string;
  detail: string;
}

/** The three steps, in order. */
export const WELCOME_STEPS: readonly WelcomeStep[] = [
  {
    number: "01",
    title: "Snap it",
    detail: "Photograph a receipt and let AI pull out items, tax, tip, and total.",
  },
  {
    number: "02",
    title: "Split it",
    detail: "Divide equally, by shares, by percentage, or assign every item to the right people.",
  },
  {
    number: "03",
    title: "Clear it",
    detail:
      "See who owes what, open their preferred payment app or copy their saved handle, then record the settlement.",
  },
];

/** Above and below the sign-in buttons. Apple and Google both create an account on first use. */
export const WELCOME_SIGN_IN = {
  prompt: "Sign in or create your account",
  newcomer: "New here? Continuing creates your account.",
} as const;
