/** Spending card: the person's share per month as a column chart under its total. */

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { CurrencyInsights } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { compactMoney } from "@haalkhata/shared/analytics/chart";
import { averagePerMonth } from "@haalkhata/shared/analytics/insights";
import { spendingColumns } from "@haalkhata/shared/analytics/spendingChart";
import { formatMoney } from "@haalkhata/shared/money/money";
import { colors, spacing } from "@/lib/theme/theme";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders what the person spent over the window: the total as the one large
 * figure, the months that add up to it as columns, and what they paid up
 * front and settled as plain numbers underneath.
 *
 * "Spent" is their share of each expense, whoever paid at the counter; what
 * they fronted is a different fact and gets its own line. The selected
 * month's amount is written out above the chart, so reading a value never
 * depends on touching a bar.
 */
export function SpendingCard({
  months,
  block,
  activeMonth,
  onActivateMonth,
  style,
}: {
  /** The window's "YYYY-MM" keys, oldest first. */
  months: readonly string[];
  /** The window's money in the chosen currency; undefined when there is none. */
  block: CurrencyInsights | undefined;
  /** The selected month's key. */
  activeMonth: string;
  /** Called with a month's key when its column is tapped. */
  onActivateMonth: (month: string) => void;
  /** Layout styles for the card, e.g. its share of a row. */
  style?: StyleProp<ViewStyle>;
}) {
  if (!block) {
    return (
      <InsightCard style={style} title="Your spending">
        <Text style={styles.empty}>No expenses in this period. Add one and this fills in.</Text>
      </InsightCard>
    );
  }

  const currency = block.currency;
  const { columns, ceiling } = spendingColumns(months, block.monthlyShareCents, currency);
  const active = columns.find((column) => column.key === activeMonth);

  return (
    <InsightCard
      style={style}
      subtitle="Your share of each expense, whoever paid."
      title="Your spending"
    >
      <Text style={styles.total}>{formatMoney(block.shareCents, currency)}</Text>
      <Text style={styles.average}>
        About {formatMoney(averagePerMonth(block.shareCents, months.length), currency)} a month
      </Text>

      {/* The selected month in words: the chart's values are never reachable
          only by touching a bar. */}
      <Text accessibilityLiveRegion="polite" style={styles.readout}>
        {active ? (
          <>
            <Text style={styles.readoutMonth}>{active.name}</Text>
            <Text style={styles.readoutSeparator}> · </Text>
            <Text style={styles.readoutValue}>{active.valueLabel}</Text>
          </>
        ) : null}
      </Text>

      <ColumnChart
        activeKey={activeMonth}
        ceiling={ceiling}
        columns={columns}
        description={`Your share of expenses per month, in ${currency}`}
        formatTick={(cents) => compactMoney(cents, currency)}
        onActivate={onActivateMonth}
      />

      <View style={styles.facts}>
        <View style={styles.fact}>
          <Text numberOfLines={1} style={styles.factLabel}>
            Paid up front
          </Text>
          <Text numberOfLines={1} style={styles.factValue}>
            {formatMoney(block.paidCents, currency)}
          </Text>
        </View>
        <View style={styles.fact}>
          <Text numberOfLines={1} style={styles.factLabel}>
            You paid back
          </Text>
          <Text numberOfLines={1} style={styles.factValue}>
            {formatMoney(block.settledOutCents, currency)}
          </Text>
        </View>
        <View style={styles.fact}>
          <Text numberOfLines={1} style={styles.factLabel}>
            Paid back to you
          </Text>
          <Text numberOfLines={1} style={styles.factValue}>
            {formatMoney(block.settledInCents, currency)}
          </Text>
        </View>
      </View>
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  average: {
    color: colors.inkSoft,
    fontSize: 14,
    marginTop: 2,
  },
  empty: {
    color: colors.inkSoft,
    fontSize: 14,
    paddingVertical: spacing.xl,
    textAlign: "center",
  },
  fact: {
    flex: 1,
    minWidth: 0,
  },
  factLabel: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  factValue: {
    color: colors.ink,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    marginTop: 2,
  },
  facts: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  },
  readout: {
    fontSize: 14,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  readoutMonth: {
    color: colors.ink,
    fontWeight: "600",
  },
  readoutSeparator: {
    color: colors.inkSoft,
  },
  readoutValue: {
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  total: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "700",
  },
});
