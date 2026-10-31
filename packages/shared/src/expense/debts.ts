/** Who owes whom on one expense: read by the server's ledger and by a bill's screen, so both name the same people. */

/** One directed debt: `from` owes `to` a positive number of cents. */
export interface LedgerEntry {
  /** User id of the debtor (the one who owes). */
  from: string;
  /** User id of the creditor (the one who is owed). */
  to: string;
  /** Amount owed in integer cents; always > 0. */
  amountCents: number;
}

/** A user id paired with an amount of cents (a payment made or a share owed). */
export interface PartyAmount {
  userId: string;
  amountCents: number;
}

/**
 * Converts one expense (who paid what / who owes what) into deterministic
 * pairwise debtor→creditor entries. Each participant's net is paid − owed
 * (> 0 ⇒ creditor); debtors are then matched greedily against creditors in
 * sorted-user-id order, so the same expense always yields the same ledger.
 *
 * @param payers - How many cents each user actually paid toward the expense.
 * @param splits - How many cents each user owes for the expense.
 * @returns Directed debts whose amounts sum to the expense's total imbalance.
 */
export function expenseDebts(
  payers: PartyAmount[],
  splits: PartyAmount[],
): LedgerEntry[] {
  const netByUser = new Map<string, number>(); // paid - owed; > 0 ⇒ creditor
  for (const payer of payers) {
    netByUser.set(payer.userId, (netByUser.get(payer.userId) ?? 0) + payer.amountCents);
  }
  for (const split of splits) {
    netByUser.set(split.userId, (netByUser.get(split.userId) ?? 0) - split.amountCents);
  }

  const creditors = [...netByUser.entries()]
    .filter(([, netAmount]) => netAmount > 0)
    .sort(([firstUserId], [secondUserId]) => firstUserId.localeCompare(secondUserId))
    .map(([userId, netAmount]) => ({ userId, remainingCents: netAmount }));
  const debtors = [...netByUser.entries()]
    .filter(([, netAmount]) => netAmount < 0)
    .sort(([firstUserId], [secondUserId]) => firstUserId.localeCompare(secondUserId))
    .map(([userId, netAmount]) => ({ userId, remainingCents: -netAmount }));

  const entries: LedgerEntry[] = [];
  let creditorIndex = 0;
  for (const debtor of debtors) {
    while (debtor.remainingCents > 0 && creditorIndex < creditors.length) {
      const creditor = creditors[creditorIndex];
      const amount = Math.min(debtor.remainingCents, creditor.remainingCents);
      if (amount > 0) {
        entries.push({ from: debtor.userId, to: creditor.userId, amountCents: amount });
      }
      debtor.remainingCents -= amount;
      creditor.remainingCents -= amount;
      if (creditor.remainingCents === 0) creditorIndex++;
    }
  }
  return entries;
}
