/** "Split it": a bill whose items are handed to the people who had them, ending on each person's share. */

import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";
import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { useIdleLoop } from "@/lib/motion/hooks/useIdleLoop";
import { colors, radii, spacing } from "@/lib/theme/theme";
import {
  ILLUSTRATION_REST_FRAME,
  SAMPLE_PEOPLE,
  SAMPLE_SPLIT_BILL,
  SAMPLE_SPLIT_ITEMS,
  SAMPLE_SPLIT_TOTALS,
} from "@/screens/login/constants/welcome";
import { SplitItemRow } from "./components/SplitItemRow/SplitItemRow";

/**
 * Draws an itemized bill. Item by item, the people who shared it pop onto
 * its row; then each person's exact share appears underneath. One looping
 * clock drives it on the UI thread; off its page or under Reduce Motion it
 * rests on the finished split.
 *
 * @param props - Component props.
 * @returns The illustration.
 */
export function SplitIllustration({
  active,
}: {
  /** Whether this page is the one on screen. */
  active: boolean;
}) {
  const cycle = useIdleLoop(active, ILLUSTRATION_REST_FRAME);

  const totalsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0.56, 0.64, 0.92, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(cycle.value, [0.56, 0.66], [8, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <View
      accessible
      accessibilityLabel="An itemized bill split between four friends, to the cent"
      style={styles.card}
    >
      <View style={styles.header}>
        <Text numberOfLines={1} style={styles.title}>{SAMPLE_SPLIT_BILL.title}</Text>
        <Text style={styles.total}>{SAMPLE_SPLIT_BILL.total}</Text>
      </View>
      <View style={styles.items}>
        {SAMPLE_SPLIT_ITEMS.map((item, index) => (
          <SplitItemRow
            amount={item.amount}
            assignAt={0.08 + index * 0.15}
            cycle={cycle}
            key={item.label}
            label={item.label}
            people={item.people.map((personIndex) => SAMPLE_PEOPLE[personIndex]!)}
          />
        ))}
      </View>
      <Animated.View style={[styles.totals, totalsStyle]}>
        {SAMPLE_PEOPLE.map((person, index) => (
          <View key={person.id} style={styles.share}>
            <Avatar size="sm" user={person} />
            <Text style={styles.shareAmount}>{SAMPLE_SPLIT_TOTALS[index]}</Text>
          </View>
        ))}
      </Animated.View>
      <View style={styles.exact}>
        <Check color={colors.pos600} size={14} />
        <Text style={styles.exactText}>Split exactly to the cent</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    width: 280,
  },
  exact: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  exactText: { color: colors.inkSoft, fontSize: 11, fontWeight: "500" },
  header: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  items: { gap: spacing.sm },
  share: { alignItems: "center", gap: 2 },
  shareAmount: { color: colors.ink, fontSize: 11, fontVariant: ["tabular-nums"], fontWeight: "700" },
  title: { color: colors.ink, flexShrink: 1, fontSize: 14, fontWeight: "700" },
  total: { color: colors.ink, fontSize: 14, fontVariant: ["tabular-nums"], fontWeight: "700" },
  totals: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.md,
  },
});
