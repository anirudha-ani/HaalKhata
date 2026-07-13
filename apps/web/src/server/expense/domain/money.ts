/** Integer money math: largest-remainder allocation of cents across weights. */

/**
 * Largest-remainder allocation: distributes `totalCents` proportionally to
 * `weights`, in integer cents, summing EXACTLY to `totalCents`.
 *
 * How it works: each weight first receives the floor of its exact
 * proportional share, so no one is over-paid. The cents lost to flooring
 * (the remainder) are then handed out one at a time to the entries with the
 * largest fractional parts — the ones that were rounded down the most.
 * Ties break by index, so the result is deterministic. All-zero weights
 * fall back to an equal split.
 *
 * @param totalCents - Amount to distribute, as a non-negative integer number of cents.
 * @param weights - Relative non-negative weights, one per recipient; only their ratios matter.
 * @returns Integer cents per recipient, in `weights` order, summing exactly to `totalCents`.
 * @throws Error if `totalCents` is negative or fractional, or any weight is negative.
 */
export function allocate(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error(`allocate: totalCents must be a non-negative integer, got ${totalCents}`);
  }
  if (weights.some((weight) => weight < 0)) {
    throw new Error("allocate: weights must be non-negative");
  }
  const weightSum = weights.reduce((runningTotal, weight) => runningTotal + weight, 0);
  const effectiveWeights = weightSum === 0 ? weights.map(() => 1) : weights;
  const effectiveSum = weightSum === 0 ? weights.length : weightSum;

  const exactShares = effectiveWeights.map((weight) => (totalCents * weight) / effectiveSum);
  const result = exactShares.map(Math.floor);
  let remainder = totalCents - result.reduce((runningTotal, cents) => runningTotal + cents, 0);

  // Hand out remainder cents to the largest fractional parts first (ties by index).
  const remainderOrder = exactShares
    .map((share, index) => ({ fractionalPart: share - Math.floor(share), index }))
    .sort(
      (first, second) =>
        second.fractionalPart - first.fractionalPart || first.index - second.index,
    );
  for (let centIndex = 0; remainder > 0; centIndex++, remainder--) {
    result[remainderOrder[centIndex % remainderOrder.length].index] += 1;
  }
  return result;
}
