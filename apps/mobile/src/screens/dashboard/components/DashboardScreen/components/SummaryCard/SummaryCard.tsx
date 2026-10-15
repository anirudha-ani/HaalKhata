/** One currency summary card, shared by the three dashboard totals. */

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
export function SummaryCard({
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
  const { fontScale } = useResponsiveLayout();
  return (
    <View
      style={[
        styles.summaryCard,
        { width: 160 * fontScale },
        strong ? (tone === "pos" ? styles.summaryCardPos : styles.summaryCardNeg) : null,
      ]}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        numberOfLines={1}
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
