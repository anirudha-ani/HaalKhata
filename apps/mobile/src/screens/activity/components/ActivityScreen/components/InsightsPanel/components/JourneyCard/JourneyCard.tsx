/** Journey card: how long the person has been here and what they have done in total. */

import { StyleSheet, View } from "react-native";
import type { Journey } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { StatTile } from "@/components/charts/StatTile";
import { useResponsiveLayout } from "@/components/shell/hooks/useResponsiveLayout";
import {
  calendarDayLabel,
  memberDuration,
  memberSinceLabel,
  UNKNOWN_DURATION_LABEL,
} from "@haalkhata/shared/analytics/insights";
import { spacing } from "@/lib/theme/theme";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders the person's lifetime figures as a grid of stat tiles. These are
 * totals since they joined; the period chosen below does not change them,
 * which is why this card sits above that control rather than under it.
 */
export function JourneyCard({
  journey,
}: {
  /** The person's lifetime figures. */
  journey: Journey;
}) {
  const { isTablet } = useResponsiveLayout();
  const since = memberSinceLabel(journey.memberSince);
  const firstExpense = calendarDayLabel(journey.firstExpenseDate);
  const tileStyle = isTablet ? styles.tileTablet : styles.tile;
  return (
    <InsightCard
      subtitle={since ? `On HaalKhata since ${since}` : undefined}
      title="Your journey"
    >
      <View style={styles.grid}>
        <View style={tileStyle}>
          <StatTile label="Member for" value={memberDuration(journey.memberSince) || UNKNOWN_DURATION_LABEL} />
        </View>
        <View style={tileStyle}>
          <StatTile
            hint={firstExpense ? `First: ${firstExpense}` : undefined}
            label="Expenses"
            value={journey.expenseCount.toLocaleString()}
          />
        </View>
        <View style={tileStyle}>
          <StatTile label="Payments" value={journey.paymentCount.toLocaleString()} />
        </View>
        <View style={tileStyle}>
          <StatTile label="Groups" value={journey.groupCount.toLocaleString()} />
        </View>
        <View style={tileStyle}>
          <StatTile label="Friends" value={journey.friendCount.toLocaleString()} />
        </View>
        <View style={tileStyle}>
          <StatTile
            label="Receipts scanned"
            value={journey.receiptScanCount.toLocaleString()}
          />
        </View>
      </View>
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  // Two to a row on a phone: the basis leaves room for the gap, and growing
  // closes whatever is left so the tiles meet the card's edges.
  tile: {
    flexBasis: "45%",
    flexGrow: 1,
    minWidth: 0,
  },
  tileTablet: {
    flexBasis: "30%",
    flexGrow: 1,
    minWidth: 0,
  },
});
