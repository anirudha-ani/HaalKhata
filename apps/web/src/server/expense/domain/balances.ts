/** Pairwise balances and debt simplification — pure functions. */

import { expenseDebts, type LedgerEntry, type PartyAmount } from "@haalkhata/shared/expense/debts";

export { expenseDebts, type LedgerEntry, type PartyAmount };

/**
 * Nets expense debts against settlements (a settlement from→to reduces what
 * `from` owes `to`) and normalizes each user pair to a single entry pointing
 * in the positive direction.
 *
 * @param debts - Directed debts derived from expenses.
 * @param settlements - Recorded payments; each one reduces the payer's debt to the recipient.
 * @returns At most one entry per user pair, sorted by pair, every amount > 0.
 */
export function pairwiseBalances(
  debts: LedgerEntry[],
  settlements: LedgerEntry[],
): LedgerEntry[] {
  // Keyed "low|high" (user ids sorted); value = cents the low id owes the high id.
  const netByPair = new Map<string, number>();
  const addDirected = (fromUser: string, toUser: string, amount: number) => {
    const [lowUserId, highUserId] =
      fromUser < toUser ? [fromUser, toUser] : [toUser, fromUser];
    const signed = fromUser === lowUserId ? amount : -amount;
    netByPair.set(
      `${lowUserId}|${highUserId}`,
      (netByPair.get(`${lowUserId}|${highUserId}`) ?? 0) + signed,
    );
  };
  for (const debt of debts) addDirected(debt.from, debt.to, debt.amountCents);
  for (const settlement of settlements) {
    addDirected(settlement.from, settlement.to, -settlement.amountCents);
  }

  const result: LedgerEntry[] = [];
  for (const [pairKey, netCents] of [...netByPair.entries()].sort(([firstKey], [secondKey]) =>
    firstKey.localeCompare(secondKey),
  )) {
    if (netCents === 0) continue;
    const [lowUserId, highUserId] = pairKey.split("|");
    result.push(
      netCents > 0
        ? { from: lowUserId, to: highUserId, amountCents: netCents }
        : { from: highUserId, to: lowUserId, amountCents: -netCents },
    );
  }
  return result;
}

/**
 * Aggregates pairwise debts into each user's overall net position.
 *
 * @param debts - Directed debts to aggregate.
 * @returns Map of user id → net cents; > 0 ⇒ that user is owed money overall.
 */
export function netBalances(debts: LedgerEntry[]): Map<string, number> {
  const netByUser = new Map<string, number>();
  for (const debt of debts) {
    netByUser.set(debt.from, (netByUser.get(debt.from) ?? 0) - debt.amountCents);
    netByUser.set(debt.to, (netByUser.get(debt.to) ?? 0) + debt.amountCents);
  }
  return netByUser;
}

/** Who paid and who owes on one expense, as {@link expenseNetChanges} compares them. */
export interface PaidAndOwed {
  payers: PartyAmount[];
  splits: PartyAmount[];
}

/**
 * How much each person's net (paid − owed) moves when one expense changes
 * from `before` to `after`. A deleted expense changes to nothing (empty
 * lists). People whose net does not move are left out, so a replacement
 * that only shuffles the same amounts between the same people moves nobody.
 *
 * @param before - The expense as stored.
 * @param after - The expense as it will be; empty lists when it is deleted.
 * @returns Map of user id → non-zero change in cents (> 0 ⇒ owed more).
 */
export function expenseNetChanges(
  before: PaidAndOwed,
  after: PaidAndOwed,
): Map<string, number> {
  const changeByUser = new Map<string, number>();
  const addChange = (userId: string, cents: number) =>
    changeByUser.set(userId, (changeByUser.get(userId) ?? 0) + cents);
  for (const payer of after.payers) addChange(payer.userId, payer.amountCents);
  for (const split of after.splits) addChange(split.userId, -split.amountCents);
  for (const payer of before.payers) addChange(payer.userId, -payer.amountCents);
  for (const split of before.splits) addChange(split.userId, split.amountCents);
  return new Map([...changeByUser].filter(([, cents]) => cents !== 0));
}

/**
 * Greedy min-cash-flow simplification: repeatedly matches the largest
 * creditor with the largest debtor and settles the smaller of the two
 * amounts, until every balance is zero. Preserves every user's net position
 * while producing at most (participants − 1) payments. Ties break by user
 * id for determinism.
 *
 * Both arrays are sorted once (descending by amount, then by user id) and
 * walked with index pointers — after each settlement the exhausted side's
 * pointer advances. This is O(n log n) instead of the O(n² log n) of
 * re-sorting every iteration.
 *
 * @param netByUser - Net cents per user (> 0 ⇒ owed money), e.g. from `netBalances`.
 * @returns A short list of payments that settles all net positions.
 */
export function simplifyDebts(netByUser: Map<string, number>): LedgerEntry[] {
  const byAmountThenId = (
    first: { userId: string; remainingCents: number },
    second: { userId: string; remainingCents: number },
  ) => second.remainingCents - first.remainingCents || first.userId.localeCompare(second.userId);

  const creditors = [...netByUser.entries()]
    .filter(([, netAmount]) => netAmount > 0)
    .map(([userId, netAmount]) => ({ userId, remainingCents: netAmount }))
    .sort(byAmountThenId);
  const debtors = [...netByUser.entries()]
    .filter(([, netAmount]) => netAmount < 0)
    .map(([userId, netAmount]) => ({ userId, remainingCents: -netAmount }))
    .sort(byAmountThenId);

  const entries: LedgerEntry[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.remainingCents, debtor.remainingCents);
    entries.push({ from: debtor.userId, to: creditor.userId, amountCents: amount });
    creditor.remainingCents -= amount;
    debtor.remainingCents -= amount;
    if (creditor.remainingCents === 0) creditorIndex++;
    if (debtor.remainingCents === 0) debtorIndex++;
  }
  return entries;
}
