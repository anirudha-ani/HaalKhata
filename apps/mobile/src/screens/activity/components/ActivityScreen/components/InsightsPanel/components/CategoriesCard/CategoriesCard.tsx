/** Categories card: where the person's spending went, by expense category. */

import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/ui/Text";
import type { CurrencyInsights } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList";
import { CATEGORY_EMOJI } from "@/components/expenses/categoryEmoji";
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
  const ranked = rankCategorySpending(block?.categories ?? []);
  if (!block || ranked.length === 0) return null;

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
