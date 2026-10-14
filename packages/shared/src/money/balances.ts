/** Per-currency balance helpers — a position is one amount per currency, never a sum across them. */

/** One amount in one currency, as the API's CurrencyAmount carries it. */
export interface CurrencyBucket {
  /** ISO 4217 code. */
  currency: string;
  /** Signed cents; the sign convention is the caller's (usually > 0 = owed to you). */
  cents: number;
}

/** Totals in one currency across every counterparty. */
export interface CurrencyTotal {
  currency: string;
  owedToYouCents: number;
  youOweCents: number;
}

/**
 * Adds up what is owed to you and what you owe, per currency, across a list
 * of positions. Never across currencies: a dollar owed to you and a euro you
 * owe are two facts, and this returns two rows.
 *
 * @param positions - Anything carrying per-currency `balances`.
 * @param defaultCurrency - Listed first when present, so the caller's own
 *   currency leads.
 * @returns One total per currency with anything outstanding, default first,
 *   the rest alphabetical.
 */
export function totalsByCurrency(
  positions: readonly { balances: readonly CurrencyBucket[] }[],
  defaultCurrency: string,
): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const position of positions) {
    for (const bucket of position.balances) {
      if (bucket.cents === 0) continue;
      const total = totals.get(bucket.currency) ?? {
        currency: bucket.currency,
        owedToYouCents: 0,
        youOweCents: 0,
      };
      if (bucket.cents > 0) total.owedToYouCents += bucket.cents;
      else total.youOweCents += -bucket.cents;
      totals.set(bucket.currency, total);
    }
  }
  return [...totals.values()].sort(compareCurrencies(defaultCurrency));
}

/**
 * Orders currency codes with the default first and the rest alphabetically —
 * the one order every screen lists buckets in.
 *
 * @param defaultCurrency - The code to put first.
 * @returns A comparator over anything carrying a `currency`.
 */
export function compareCurrencies(
  defaultCurrency: string,
): (first: { currency: string }, second: { currency: string }) => number {
  return (first, second) =>
    first.currency === defaultCurrency
      ? -1
      : second.currency === defaultCurrency
        ? 1
        : first.currency.localeCompare(second.currency);
}

/**
 * The bucket a settle action should open on: the largest outstanding amount
 * in any one currency. Magnitudes in different currencies are not comparable,
 * so this is a choice of where to start, not a claim about size; the settle
 * dialog lets the payer switch currency.
 *
 * @param balances - Per-currency position; > 0 = owed to you.
 * @returns The bucket to start from, or undefined when nothing is outstanding.
 */
export function leadingBucket(balances: readonly CurrencyBucket[]): CurrencyBucket | undefined {
  return balances
    .filter((bucket) => bucket.cents !== 0)
    .sort((first, second) => Math.abs(second.cents) - Math.abs(first.cents))[0];
}

/**
 * Only the buckets with something in them, in display order.
 *
 * @param balances - Per-currency position.
 * @param defaultCurrency - Listed first when present.
 * @returns Non-zero buckets, default currency first.
 */
export function outstandingBuckets(
  balances: readonly CurrencyBucket[],
  defaultCurrency: string,
): CurrencyBucket[] {
  return balances.filter((bucket) => bucket.cents !== 0).sort(compareCurrencies(defaultCurrency));
}

/**
 * Says which way a per-currency position points, for the line under a
 * person's name.
 *
 * With every bucket pointing the same way it is one phrase. When they point
 * both ways the phrases follow the buckets, one each in the same order, so
 * the first phrase belongs to the first amount shown: a fixed "owes you · you
 * owe" beside "$12.69 owed by you, €75.99 owed to you" reads exactly
 * backwards.
 *
 * @param buckets - The position's non-zero buckets, in display order; > 0
 *   means the other person owes you.
 * @returns "settled up", "owes you", "you owe", or one phrase per bucket.
 */
export function positionCaption(buckets: readonly CurrencyBucket[]): string {
  const outstanding = buckets.filter((bucket) => bucket.cents !== 0);
  if (outstanding.length === 0) return "settled up";
  const phrase = (bucket: CurrencyBucket) => (bucket.cents > 0 ? "owes you" : "you owe");
  if (outstanding.every((bucket) => bucket.cents > 0)) return "owes you";
  if (outstanding.every((bucket) => bucket.cents < 0)) return "you owe";
  return outstanding.map(phrase).join(" · ");
}
