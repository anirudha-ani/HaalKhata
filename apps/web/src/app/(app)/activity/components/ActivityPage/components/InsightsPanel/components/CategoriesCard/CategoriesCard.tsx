"use client";
/** Categories card: where the person's spending went, by expense category. */

import type { CurrencyInsights } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList/BarList";
import { CATEGORY_EMOJI } from "@/components/expenses/ExpenseList/constants/categoryEmoji";
import {
  categoryLabel,
  FALLBACK_CATEGORY_EMOJI,
  foldTail,
  OTHER_CATEGORY,
  percentLabel,
  RANKED_LIST_LIMIT,
} from "@haalkhata/shared/analytics/insights";
import { formatMoney } from "@haalkhata/shared/money/money";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders the person's share by category, largest first, with the small
 * categories folded into one "Other" row so the list stays a glance long.
 *
 * A category they only paid for on someone else's behalf has no share of
 * theirs in it and is left out: it is not somewhere their money went.
 *
 * @param props - Component props.
 * @returns The card, or nothing when there is no spending to break down.
 */
export function CategoriesCard({
  block,
}: {
  /** The window's money in the chosen currency; undefined when there is none. */
  block: CurrencyInsights | undefined;
}) {
  const spent = (block?.categories ?? []).filter((entry) => entry.shareCents > 0);
  if (!block || spent.length === 0) return null;

  const ranked = foldTail(spent, RANKED_LIST_LIMIT, (tail) => ({
    ...tail[0],
    category: OTHER_CATEGORY,
    shareCents: tail.reduce((total, entry) => total + entry.shareCents, 0),
    expenseCount: tail.reduce((total, entry) => total + entry.expenseCount, 0),
  }));

  return (
    <InsightCard title="Where it went" subtitle="Your share, by category.">
      <BarList
        rows={ranked.map((entry) => ({
          key: entry.category,
          leading: (
            <span aria-hidden="true" className="text-lg leading-none">
              {CATEGORY_EMOJI[entry.category] ?? FALLBACK_CATEGORY_EMOJI}
            </span>
          ),
          label: categoryLabel(entry.category),
          value: entry.shareCents,
          valueLabel: formatMoney(entry.shareCents, block.currency),
          detail: percentLabel(entry.shareCents, block.shareCents),
        }))}
      />
    </InsightCard>
  );
}
