/** One segment of the step indicator, filling from the left when its step is reached. */

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { STEP_SPRING_DAMPING_RATIO, STEP_SPRING_DURATION_MS } from "@/lib/motion/motion.constants";
import { colors, radii } from "@/lib/theme/theme";

/**
 * Draws a thin track with a brand-colored fill that grows across it as the
 * step is reached and shrinks back when the person goes back. The fill is a
 * horizontal scale from the left edge, run on the UI thread; under Reduce
 * Motion it simply appears.
 *
 * @param props - Component props.
 * @returns The segment.
 */
export function ProgressSegment({ filled }: { filled: boolean }) {
  const reduceMotion = useReduceMotion();
  const fill = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    fill.value = reduceMotion
      ? (filled ? 1 : 0)
      : withSpring(filled ? 1 : 0, { duration: STEP_SPRING_DURATION_MS, dampingRatio: STEP_SPRING_DAMPING_RATIO });
  }, [filled, fill, reduceMotion]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, backgroundColor: colors.brand600, transformOrigin: "left" },
  track: { backgroundColor: colors.line, borderRadius: radii.full, flex: 1, height: 4, overflow: "hidden" },
});
