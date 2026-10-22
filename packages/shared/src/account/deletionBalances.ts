/** Shared balance-review states for account deletion on web and mobile. */

/** Server-computed amounts in one currency; payable and receivable stay separate. */
export interface DeletionBalanceTotal {
  currency: string;
  youOweCents: number;
  owedToYouCents: number;
}

/** Explanation shown before deletion, including when balances cannot be verified. */
export const DELETION_BALANCE_MESSAGES = {
  loading: "Checking your balances. You can still delete your account, but deletion will not mark outstanding amounts as paid.",
  unavailable: "We couldn't verify your balances. Retry or review them before deleting. You can still delete your account; outstanding amounts will not be marked as paid.",
  outstanding: "We recommend settling what you owe and collecting what you're owed before deleting. Deletion will not mark these amounts as paid. Your name and contact details will be removed, making follow-up harder.",
  settled: "You have no outstanding balances in the latest balance check.",
} as const;

/**
 * Keeps debt directions and currencies separate and never treats a failed read as zero.
 * @param input Latest balance query state; cached totals are hidden during refresh or failure.
 * @returns Review state, visible totals, explanatory copy and the final action label.
 */
export function readDeletionBalanceReview(input: {
  totals: readonly DeletionBalanceTotal[] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const totals = input.loading || input.failed ? [] : (input.totals ?? []).filter(
    (total) => total.youOweCents !== 0 || total.owedToYouCents !== 0,
  );
  const status = input.loading ? "loading"
    : input.failed || !input.totals ? "unavailable"
      : totals.length > 0 ? "outstanding" : "settled";
  return {
    status,
    totals,
    message: DELETION_BALANCE_MESSAGES[status],
    deleteLabel: status === "settled" ? "Permanently delete account" : "Delete anyway",
  };
}
