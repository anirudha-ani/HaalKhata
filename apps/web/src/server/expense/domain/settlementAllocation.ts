/** Allocation of one payment across the scopes where the payer's debt lives — pure. */

/** How much the payer owes the creditor inside one scope. */
export interface ScopeDebt {
  /** Group the debt lives in, or null for the pair's one-off ledger. */
  groupId: string | null;
  /** Cents the payer owes the creditor in this scope; always > 0. */
  owedCents: number;
}

/** One recorded slice of a payment: which scope it pays down, and how much. */
export interface SettlementPortion {
  /** Scope the slice is recorded in; null = the one-off pair ledger. */
  groupId: string | null;
  /** Cents recorded in that scope; always > 0. */
  amountCents: number;
}

/**
 * Splits a payment across the scopes where the payer actually owes money.
 *
 * A debt lives in exactly one scope — a group, or the pair's one-off ledger —
 * and each scope's balance only sees its own settlement rows. A payment that
 * covers group debt therefore has to be *recorded in that group*, or the
 * group goes on demanding money that has already changed hands. This function
 * decides that placement, once, at write time. Deciding it at read time
 * instead would re-allocate history whenever a new expense arrives, silently
 * rewriting past statements.
 *
 * Order: the one-off ledger first, then groups by largest debt, ties by group
 * id. One-off first because it is the pair's direct account — the group
 * scopes are shared with other people and their statements should move only
 * when the direct slate could not absorb the payment. The order is
 * deterministic so the same payment always lands the same way.
 *
 * The caller must have verified `amountCents` ≤ the sum of `scopes` debts;
 * anything left after every scope is filled is silently unallocated, which
 * the guard upstream exists to prevent.
 *
 * @param scopes - Per-scope debts of payer → creditor, every amount > 0.
 * @param amountCents - The payment to place; > 0.
 * @returns One portion per scope touched, in allocation order; sums to
 *   `amountCents` when the debts cover it.
 */
export function allocateSettlement(
  scopes: readonly ScopeDebt[],
  amountCents: number,
): SettlementPortion[] {
  // At most one scope has groupId null (the pair has a single one-off
  // ledger), so the null-first comparison never has to order two nulls.
  const ordered = [...scopes].sort((first, second) => {
    if (first.groupId === null) return -1;
    if (second.groupId === null) return 1;
    return second.owedCents - first.owedCents || first.groupId.localeCompare(second.groupId);
  });

  const portions: SettlementPortion[] = [];
  let remainingCents = amountCents;
  for (const scope of ordered) {
    if (remainingCents <= 0) break;
    const sliceCents = Math.min(scope.owedCents, remainingCents);
    if (sliceCents > 0) {
      portions.push({ groupId: scope.groupId, amountCents: sliceCents });
      remainingCents -= sliceCents;
    }
  }
  return portions;
}
