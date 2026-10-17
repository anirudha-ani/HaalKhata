/** "Snap it": a receipt being read line by line, ending on the stamp that says what was found. */

import { ReceiptText } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";
import { Text } from "@/components/ui/Text";
import { useIdleLoop } from "@/lib/motion/hooks/useIdleLoop";
import { colors, radii, spacing } from "@/lib/theme/theme";
import {
  RECEIPT_SCAN_HEIGHT,
  RECEIPT_WIDTH,
  SAMPLE_RECEIPT,
  SAMPLE_RECEIPT_LINES,
} from "@/screens/login/constants/welcome";
import { ReceiptLine } from "./components/ReceiptLine/ReceiptLine";

/** The clock value showing the read receipt with its stamp, for a still picture. */
const REST_FRAME = 0.8;

/**
 * Draws a slightly tilted receipt with a scan line sweeping down it. Each
 * line brightens as the scan passes, then the "items found" stamp lands.
 * Everything moves on the UI thread from one looping clock; off its page or
 * under Reduce Motion it rests on the finished, stamped receipt.
 *
 * @param props - Component props.
 * @returns The illustration.
 */
export function ScanIllustration({
  active,
}: {
  /** Whether this page is the one on screen. */
  active: boolean;
}) {
  const cycle = useIdleLoop(active, REST_FRAME);

  const scanStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0, 0.04, 0.52, 0.58], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(cycle.value, [0, 0.55], [0, RECEIPT_SCAN_HEIGHT], Extrapolation.CLAMP) },
    ],
  }));

  const stampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0.6, 0.66, 0.92, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { rotate: "-6deg" },
      { scale: interpolate(cycle.value, [0.6, 0.68, 0.72], [1.6, 0.94, 1], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View accessible accessibilityLabel="A receipt being scanned: three items found" style={styles.stage}>
      <View style={styles.receipt}>
        <View style={styles.receiptHeader}>
          <ReceiptText color={colors.brand600} size={16} />
          <Text style={styles.receiptTitle}>RECEIPT</Text>
        </View>
        <View style={styles.lines}>
          {SAMPLE_RECEIPT_LINES.map((line, index) => (
            <ReceiptLine
              amount={line.amount}
              cycle={cycle}
              key={line.label}
              label={line.label}
              revealAt={0.08 + index * 0.11}
            />
          ))}
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalText}>Total</Text>
          <Text style={styles.totalText}>{SAMPLE_RECEIPT.total}</Text>
        </View>
        <Animated.View pointerEvents="none" style={[styles.scanLine, scanStyle]} />
      </View>
      <Animated.View style={[styles.stamp, stampStyle]}>
        <Text style={styles.stampText}>{SAMPLE_RECEIPT.stamp}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  lines: { gap: spacing.sm, paddingVertical: spacing.md },
  receipt: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    transform: [{ rotate: "-2.5deg" }],
    width: RECEIPT_WIDTH,
  },
  receiptHeader: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  receiptTitle: { color: colors.inkSoft, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  scanLine: {
    backgroundColor: colors.brand500,
    height: 2,
    left: 0,
    position: "absolute",
    right: 0,
    shadowColor: colors.brand500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    top: spacing.xl + spacing.sm,
  },
  stage: { alignItems: "center", justifyContent: "center" },
  stamp: {
    backgroundColor: colors.card,
    borderColor: colors.brand500,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    bottom: -spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: "absolute",
    right: -spacing.sm,
  },
  stampText: { color: colors.brand600, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  totalRow: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
  },
  totalText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
});
