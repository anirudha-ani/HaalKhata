/** Pure assembly of the per-currency half of an insights response from grouped ledger rows. */

/** One currency's spending in one calendar month. */
export interface MonthlySpending {
  currency: string;
  /** "YYYY-MM". */
  month: string;
  shareCents: number;
  paidCents: number;
}

/** One currency's spending in one expense category. */
export interface CategorySpending {
  currency: string;
  category: string;
  shareCents: number;
}

/** What was paid and received settling up in one currency. */
export interface PaymentTotals {
  currency: string;
  paidCents: number;
  receivedCents: number;
}

/** Everything the window holds in one currency. */
export interface CurrencyInsights {
  currency: string;
  shareCents: number;
  paidCents: number;
  /** One entry per month of the window, zeros included. */
  monthlyShareCents: number[];
  /** Largest share first. */
  categories: { category: string; shareCents: number }[];
  settledOutCents: number;
  settledInCents: number;
}

/**
 * Lays grouped rows out as one block per currency.
 *
 * Currencies are never combined: each block is a separate ledger, and the
 * only thing ordering them is which one the person thinks in (their default
 * first) and then how much they spent. A currency appears when the window
 * holds an expense or a payment in it, so a month in which someone only
 * settled an old euro debt still shows the euros.
 *
 * @param months - The window's "YYYY-MM" keys, oldest first.
 * @param defaultCurrency - The person's default currency, listed first.
 * @param monthly - Spending grouped by currency and month.
 * @param categories - Spending grouped by currency and category.
 * @param payments - Settling-up totals grouped by currency.
 * @returns One block per currency, in display order.
 */
export function assembleCurrencyInsights(
  months: readonly string[],
  defaultCurrency: string,
  monthly: readonly MonthlySpending[],
  categories: readonly CategorySpending[],
  payments: readonly PaymentTotals[],
): CurrencyInsights[] {
  const monthIndex = new Map(months.map((month, index) => [month, index]));
  const blocks = new Map<string, CurrencyInsights>();
  /** Finds or starts the block for a currency. */
  const blockFor = (currency: string): CurrencyInsights => {
    let block = blocks.get(currency);
    if (!block) {
      block = {
        currency,
        shareCents: 0,
        paidCents: 0,
        monthlyShareCents: months.map(() => 0),
        categories: [],
        settledOutCents: 0,
        settledInCents: 0,
      };
      blocks.set(currency, block);
    }
    return block;
  };

  for (const spending of monthly) {
    const position = monthIndex.get(spending.month);
    // A month outside the window cannot come back from a windowed query;
    // skipping one keeps a stray row from landing in the wrong bar.
    if (position === undefined) continue;
    const block = blockFor(spending.currency);
    block.shareCents += spending.shareCents;
    block.paidCents += spending.paidCents;
    block.monthlyShareCents[position] += spending.shareCents;
  }
  for (const spending of categories) {
    blockFor(spending.currency).categories.push({
      category: spending.category,
      shareCents: spending.shareCents,
    });
  }
  for (const totals of payments) {
    const block = blockFor(totals.currency);
    block.settledOutCents += totals.paidCents;
    block.settledInCents += totals.receivedCents;
  }

  for (const block of blocks.values()) {
    block.categories.sort(
      (first, second) =>
        second.shareCents - first.shareCents || first.category.localeCompare(second.category),
    );
  }
  return [...blocks.values()].sort((first, second) => {
    if (first.currency === defaultCurrency) return -1;
    if (second.currency === defaultCurrency) return 1;
    return second.shareCents - first.shareCents || first.currency.localeCompare(second.currency);
  });
}
