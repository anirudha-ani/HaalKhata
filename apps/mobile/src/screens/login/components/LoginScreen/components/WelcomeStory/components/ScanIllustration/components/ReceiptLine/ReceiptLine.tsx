/** One line of the sample receipt, brightening as the scan passes it. */

import { StyleSheet } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { Text } from "@/components/ui/Text";
import { colors } from "@/lib/theme/theme";

/**
 * Renders a label and amount, faint until the illustration's clock reaches
 * `revealAt`, then fully inked, and faint again as the loop resets.
 *
 * @param props - Component props.
 * @returns The receipt line.
 */
export function ReceiptLine({
  label,
  amount,
  cycle,
  revealAt,
}: {
  label: string;
  amount: string;
  /** The illustration's looping clock. */
  cycle: SharedValue<number>;
  /** Clock value at which the scan line passes this line. */
  revealAt: number;
}) {
  const lineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [revealAt, revealAt + 0.06, 0.92, 1], [0.28, 1, 1, 0.28], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[styles.line, lineStyle]}>
      <Text numberOfLines={1} style={styles.label}>{label}</Text>
      <Text style={styles.amount}>{amount}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  amount: { color: colors.ink, fontSize: 12, fontVariant: ["tabular-nums"] },
  label: { color: colors.inkSoft, flexShrink: 1, fontSize: 12 },
  line: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
});
