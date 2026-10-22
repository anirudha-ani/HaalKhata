/** A green check that pops in with a ring rippling out once behind it. */

import { useEffect } from "react";
import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { POP_SPRING } from "@/lib/motion/motion.constants";
import { colors, radii } from "@/lib/theme/theme";
import {
  SUCCESS_MARK_SIZE,
  SUCCESS_RIPPLE_DELAY_MS,
  SUCCESS_RIPPLE_MS,
  SUCCESS_TICK_DELAY_MS,
} from "../../../../../../constants/onboarding";


/**
 * Celebrates the end of setup without lingering: the disc springs up from
 * nothing with a single overshoot, the check lands a beat later, and one
 * ring spreads and fades. Under Reduce Motion the finished mark is simply
 * there.
 *
 * @returns The mark.
 */
export function SuccessMark() {
  const reduceMotion = useReduceMotion();
  const disc = useSharedValue(reduceMotion ? 1 : 0);
  const tick = useSharedValue(reduceMotion ? 1 : 0);
  const ripple = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      disc.value = 1;
      tick.value = 1;
      ripple.value = 1;
      return;
    }
    disc.value = withSpring(1, POP_SPRING);
    tick.value = withDelay(SUCCESS_TICK_DELAY_MS, withSpring(1, POP_SPRING));
    ripple.value = withDelay(SUCCESS_RIPPLE_DELAY_MS, withTiming(1, { duration: SUCCESS_RIPPLE_MS }));
  }, [disc, reduceMotion, ripple, tick]);

  const discStyle = useAnimatedStyle(() => ({ transform: [{ scale: disc.value }] }));
  const tickStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, tick.value), transform: [{ scale: 0.4 + 0.6 * tick.value }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - ripple.value),
    transform: [{ scale: 1 + 0.7 * ripple.value }],
  }));

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.stage}>
      <Animated.View style={[styles.ripple, rippleStyle]} />
      <Animated.View style={[styles.disc, discStyle]}>
        <Animated.View style={tickStyle}>
          <Check color={colors.white} size={46} strokeWidth={3} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    alignItems: "center",
    backgroundColor: colors.pos600,
    borderRadius: radii.full,
    height: SUCCESS_MARK_SIZE,
    justifyContent: "center",
    width: SUCCESS_MARK_SIZE,
  },
  ripple: {
    backgroundColor: colors.pos50,
    borderColor: colors.pos600,
    borderRadius: radii.full,
    borderWidth: 2,
    height: SUCCESS_MARK_SIZE,
    position: "absolute",
    width: SUCCESS_MARK_SIZE,
  },
  stage: { alignItems: "center", height: SUCCESS_MARK_SIZE * 1.6, justifyContent: "center", width: SUCCESS_MARK_SIZE * 1.6 },
});
