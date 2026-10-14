"use client";
/** Categories card: where the person's spending went, by expense category. */

import type { CurrencyInsights } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList/BarList";
import { CATEGORY_EMOJI } from "@/components/expenses/ExpenseList/constants/categoryEmoji";
import {
  categoryLabel,
  FALLBACK_CATEGORY_EMOJI,
  percentLabel,
  rankCategorySpending,
} from "@haalkhata/shared/analytics/insights";
import { formatMoney } from "@haalkhata/shared/money/money";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders the person's share by category, largest first, with the small
 * categories folded into one "Other" row so the list stays a glance long.
 * Which rows there are is decided by the shared `rankCategorySpending`, so
 * the website and the mobile app always list the same ones.
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
  const ranked = rankCategorySpending(block?.categories ?? []);
  if (!block || ranked.length === 0) return null;

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
