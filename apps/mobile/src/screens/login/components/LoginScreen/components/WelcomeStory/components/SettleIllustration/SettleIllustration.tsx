/** "Clear it": money travelling from the person who owes to the person owed, ending all square. */

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
  SAMPLE_SETTLEMENT,
  SETTLE_TRACK_WIDTH,
} from "@/screens/login/constants/welcome";

/**
 * Draws Dot paying Oni: the amount slides along the line between them, the
 * balance line changes from what is owed to "All square", and a check lands
 * between them. Below, the payment apps the person can open from a balance.
 * Off its page or under Reduce Motion it rests on the settled picture.
 *
 * @param props - Component props.
 * @returns The illustration.
 */
export function SettleIllustration({
  active,
}: {
  /** Whether this page is the one on screen. */
  active: boolean;
}) {
  const cycle = useIdleLoop(active, ILLUSTRATION_REST_FRAME);
  const [owed, payer] = [SAMPLE_PEOPLE[0]!, SAMPLE_PEOPLE[1]!];
  // The amount starts beside the payer and ends beside the person owed.
  const travel = SETTLE_TRACK_WIDTH / 2 - spacing.lg;

  const coinStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0.08, 0.14, 0.46, 0.52], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(cycle.value, [0.12, 0.48], [travel, -travel], Extrapolation.CLAMP) }],
  }));
  const owesStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0.48, 0.56, 0.92, 1], [1, 0, 0, 1], Extrapolation.CLAMP),
  }));
  const squareStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0.52, 0.6, 0.92, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [0.52, 0.58, 0.92, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(cycle.value, [0.52, 0.6, 0.65], [0.2, 1.2, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <View
      accessible
      accessibilityLabel={`${SAMPLE_SETTLEMENT.before}; after paying, they are ${SAMPLE_SETTLEMENT.after.toLowerCase()}`}
      style={styles.card}
    >
      <View style={styles.balance}>
        <Animated.View style={owesStyle}>
          <Text style={styles.owes}>{SAMPLE_SETTLEMENT.before}</Text>
        </Animated.View>
        <Animated.View style={[styles.balanceOverlay, squareStyle]}>
          <Text style={styles.square}>{SAMPLE_SETTLEMENT.after}</Text>
        </Animated.View>
      </View>

      <View style={styles.scene}>
        <View style={styles.person}>
          <Avatar size="lg" user={owed} />
          <Text style={styles.name}>{owed.firstName}</Text>
        </View>
        <View style={styles.track}>
          <View style={styles.trackLine} />
          <Animated.View style={[styles.coin, coinStyle]}>
            <Text style={styles.coinText}>{SAMPLE_SETTLEMENT.amount}</Text>
          </Animated.View>
          <Animated.View style={[styles.check, checkStyle]}>
            <Check color={colors.white} size={18} strokeWidth={3} />
          </Animated.View>
        </View>
        <View style={styles.person}>
          <Avatar size="lg" user={payer} />
          <Text style={styles.name}>{payer.firstName}</Text>
        </View>
      </View>

      <View style={styles.apps}>
        {SAMPLE_SETTLEMENT.apps.map((appName) => (
          <View key={appName} style={styles.appChip}>
            <Text style={styles.appText}>{appName}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appChip: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  apps: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  appText: { color: colors.inkSoft, fontSize: 11, fontWeight: "600" },
  balance: { alignItems: "center", justifyContent: "center", minHeight: 30 },
  balanceOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    width: 280,
  },
  check: {
    alignItems: "center",
    backgroundColor: colors.pos600,
    borderRadius: radii.full,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    width: 32,
  },
  coin: {
    backgroundColor: colors.pos50,
    borderColor: colors.pos600,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    position: "absolute",
  },
  coinText: { color: colors.pos700, fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "700" },
  name: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  owes: { color: colors.neg700, fontSize: 14, fontWeight: "700" },
  person: { alignItems: "center", gap: spacing.xs },
  scene: { alignItems: "center", flexDirection: "row", justifyContent: "center" },
  square: { color: colors.pos700, fontSize: 14, fontWeight: "700" },
  track: { alignItems: "center", height: 48, justifyContent: "center", width: SETTLE_TRACK_WIDTH },
  trackLine: {
    borderColor: colors.line,
    borderStyle: "dashed",
    borderTopWidth: 2,
    width: "100%",
  },
});
