/** A friend's balance as per-currency buckets, whichever shape the server sent it in. */

import { type CurrencyBucket } from "@haalkhata/shared/money/balances";

/**
 * A friend's position per currency. A server predating `balances` sends only
 * the default-currency scalar, which reads the same way as one bucket.
 *
 * @param friend - A counterparty balance from the friends list.
 * @param defaultCurrency - The caller's default currency.
 * @returns Non-zero buckets, or an empty list when settled.
 */
export function bucketsOf(
  friend: { netCents: number; balances: CurrencyBucket[] },
  defaultCurrency: string,
): CurrencyBucket[] {
  const buckets =
    friend.balances.length > 0
      ? friend.balances
      : [{ currency: defaultCurrency, cents: friend.netCents }];
  return buckets.filter((bucket) => bucket.cents !== 0);
}
