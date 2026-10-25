/** Split types card: how the person's expenses were divided. */

import type { StyleProp, ViewStyle } from "react-native";
import type { SplitTypeCount } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList";
import { countLabel, percentLabel, splitTypeLabel } from "@haalkhata/shared/analytics/insights";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders how the window's expenses were split, most used first.
 *
 * @returns The card, or nothing when there were no expenses.
 */
export function SplitTypesCard({
  splitTypes,
  style,
}: {
  /** Split types in use, most used first. */
  splitTypes: readonly SplitTypeCount[];
  /** Layout styles for the card, e.g. its share of a row. */
  style?: StyleProp<ViewStyle>;
}) {
  if (splitTypes.length === 0) return null;
  const total = splitTypes.reduce((count, entry) => count + entry.expenseCount, 0);
  return (
    <InsightCard style={style} subtitle="By number of expenses." title="How you split">
      <BarList
        rows={splitTypes.map((entry) => ({
          key: entry.splitType,
          label: splitTypeLabel(entry.splitType),
          value: entry.expenseCount,
          valueLabel: countLabel(entry.expenseCount, "expense"),
          detail: percentLabel(entry.expenseCount, total),
        }))}
      />
    </InsightCard>
  );
}
