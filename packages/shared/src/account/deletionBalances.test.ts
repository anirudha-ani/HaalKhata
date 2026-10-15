/** Regression coverage for debt directions, currency separation and unknown balance reads. */

import { describe, expect, it } from "vitest";
import { readDeletionBalanceReview } from "./deletionBalances";

const TOTALS = [
  { currency: "USD", youOweCents: 1250, owedToYouCents: 1250 },
  { currency: "EUR", youOweCents: 0, owedToYouCents: 800 },
  { currency: "JPY", youOweCents: 500, owedToYouCents: 0 },
];

describe("account deletion balance review", () => {
  it("preserves both directions even when their net is zero and never combines currencies", () => {
    const review = readDeletionBalanceReview({ totals: TOTALS, loading: false, failed: false });
    expect(review.status).toBe("outstanding");
    expect(review.totals).toEqual(TOTALS);
    expect(review.deleteLabel).toBe("Delete anyway");
  });

  it("reports settled only after a successful zero balance read", () => {
    for (const totals of [[], [{ currency: "USD", youOweCents: 0, owedToYouCents: 0 }]]) {
      expect(readDeletionBalanceReview({ totals, loading: false, failed: false })).toMatchObject({
        status: "settled", totals: [], deleteLabel: "Permanently delete account",
      });
    }
  });

  it("keeps receivables visible even when the caller owes nothing", () => {
    const review = readDeletionBalanceReview({ totals: [TOTALS[1]], loading: false, failed: false });
    expect(review.status).toBe("outstanding");
    expect(review.totals[0].owedToYouCents).toBe(800);
  });

  it("does not display cached totals while refreshing them", () => {
    expect(readDeletionBalanceReview({ totals: TOTALS, loading: true, failed: false })).toMatchObject({
      status: "loading", totals: [], deleteLabel: "Delete anyway",
    });
  });

  it("does not turn a failed refresh with cached zeros into a settled account", () => {
    expect(readDeletionBalanceReview({ totals: [], loading: false, failed: true })).toMatchObject({
      status: "unavailable", totals: [], deleteLabel: "Delete anyway",
    });
    expect(readDeletionBalanceReview({ totals: TOTALS, loading: false, failed: true }).totals).toEqual([]);
  });

  it("keeps missing data distinct from a successful empty response", () => {
    expect(readDeletionBalanceReview({ totals: undefined, loading: false, failed: false }).status).toBe("unavailable");
  });
});
