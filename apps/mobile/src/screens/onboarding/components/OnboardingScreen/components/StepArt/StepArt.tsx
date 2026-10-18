/** A step's icon in a soft brand circle, with a slow ring that breathes out from it. */

import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { IDLE_LOOP_MS } from "@/lib/motion/motion.constants";
import { colors, radii } from "@/lib/theme/theme";
import { STEP_ART_SIZE } from "../../../../constants/onboarding";

/**
 * Frames an icon (or any small drawing) for the top of a step. A ring
 * expands and fades behind it on a slow loop to draw the eye without
 * demanding it; under Reduce Motion the ring is not drawn.
 *
 * @param props - Component props.
 * @returns The art.
 */
export function StepArt({ children }: { children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const ripple = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(ripple);
      ripple.value = 0;
      return undefined;
    }
    ripple.value = withRepeat(withTiming(1, { duration: IDLE_LOOP_MS, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(ripple);
  }, [reduceMotion, ripple]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : 0.5 * (1 - ripple.value),
    transform: [{ scale: 0.85 + ripple.value * 0.45 }],
  }));
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.stage}>
      <Animated.View style={[styles.ring, ringStyle]} />
      <View style={styles.disc}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    alignItems: "center",
    backgroundColor: colors.brand50,
    borderColor: colors.brand100,
    borderRadius: radii.full,
    borderWidth: 1,
    height: STEP_ART_SIZE * 0.72,
    justifyContent: "center",
    width: STEP_ART_SIZE * 0.72,
  },
  ring: {
    borderColor: colors.brand200,
    borderRadius: radii.full,
    borderWidth: 2,
    height: STEP_ART_SIZE,
    position: "absolute",
    width: STEP_ART_SIZE,
  },
  stage: { alignItems: "center", height: STEP_ART_SIZE, justifyContent: "center", width: STEP_ART_SIZE },
});
