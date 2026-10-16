/** Readable currency totals shared by dashboard and friends, expanding when an amount wraps. */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders one balance-summary stat card with a label and a formatted amount.
 *
 * @param props - Component props.
 * @returns A single summary card.
 */
export function BalanceSummaryCard({
  label,
  value,
  tone,
  strong = false,
}: {
  /** Caption shown above the amount (e.g. "You are owed"). */
  label: string;
  /** Pre-formatted money string to display. */
  value: string;
  /** Color treatment: "pos" for money owed to you, "neg" for money you owe. */
  tone: "pos" | "neg";
  /** When true, tints the card background to emphasize it (used for net balance). */
  strong?: boolean;
}) {
  const { fontScale, width } = useResponsiveLayout();
  const [expandedFor, setExpandedFor] = useState("");
  const measurement = `${value}:${width}:${fontScale}`;
  return (
    <View
      style={[
        styles.summaryCard,
        { width: expandedFor === measurement ? "100%" : styles.summaryCard.width * fontScale },
        strong ? (tone === "pos" ? styles.summaryCardPos : styles.summaryCardNeg) : null,
      ]}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        onTextLayout={(event) => {
          // Expand once per value/window/scale, retaining full digits even at accessibility sizes.
          if (event.nativeEvent.lines.length > 1) setExpandedFor(measurement);
        }}
        style={[
          styles.summaryValue,
          { color: tone === "pos" ? colors.pos600 : colors.neg600 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}


const styles = StyleSheet.create({
  summaryCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    width: 160,
    maxWidth: "100%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    padding: spacing.lg,
  },
  summaryCardNeg: {
    backgroundColor: colors.neg50,
  },
  summaryCardPos: {
    backgroundColor: colors.pos50,
  },
  summaryLabel: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  summaryValue: {
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    marginTop: spacing.xs,
  },
});
