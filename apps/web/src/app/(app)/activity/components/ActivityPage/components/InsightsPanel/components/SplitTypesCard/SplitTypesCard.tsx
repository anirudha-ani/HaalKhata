"use client";
/** Split types card: how the person's expenses were divided. */

import type { SplitTypeCount } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList/BarList";
import { countLabel, percentLabel, splitTypeLabel } from "@haalkhata/shared/analytics/insights";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders how the window's expenses were split, most used first.
 *
 * @param props - Component props.
 * @returns The card, or nothing when there were no expenses.
 */
export function SplitTypesCard({
  splitTypes,
}: {
  /** Split types in use, most used first. */
  splitTypes: readonly SplitTypeCount[];
}) {
  if (splitTypes.length === 0) return null;
  const total = splitTypes.reduce((count, entry) => count + entry.expenseCount, 0);
  return (
    <InsightCard title="How you split" subtitle="By number of expenses.">
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
