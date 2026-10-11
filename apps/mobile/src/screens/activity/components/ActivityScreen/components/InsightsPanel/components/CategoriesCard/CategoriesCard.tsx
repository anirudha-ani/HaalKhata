/** Categories card: where the person's spending went, by expense category. */

import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import type { CurrencyInsights } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList";
import { CATEGORY_EMOJI } from "@/components/expenses/categoryEmoji";
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
 * @returns The card, or nothing when there is no spending to break down.
 */
export function CategoriesCard({
  block,
  style,
}: {
  /** The window's money in the chosen currency; undefined when there is none. */
  block: CurrencyInsights | undefined;
  /** Layout styles for the card, e.g. its share of a row. */
  style?: StyleProp<ViewStyle>;
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
    <InsightCard style={style} subtitle="Your share, by category." title="Where it went">
      <BarList
        rows={ranked.map((entry) => ({
          key: entry.category,
          leading: (
            <Text style={styles.emoji}>
              {CATEGORY_EMOJI[entry.category] ?? FALLBACK_CATEGORY_EMOJI}
            </Text>
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

const styles = StyleSheet.create({
  emoji: {
    fontSize: 18,
  },
});
