/** An avatar that pops onto an item row when its person is assigned the item. */

import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";

/**
 * Wraps one avatar and scales it in with a small overshoot at `appearAt`,
 * then out again as the loop resets. Overlapping avatars tuck under each
 * other the way the app's avatar stacks do.
 *
 * @param props - Component props.
 * @returns The animated avatar.
 */
export function AssignedAvatar({
  children,
  cycle,
  appearAt,
}: {
  /** The avatar to animate. */
  children: ReactNode;
  /** The illustration's looping clock. */
  cycle: SharedValue<number>;
  /** Clock value at which the avatar lands. */
  appearAt: number;
}) {
  const popStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cycle.value, [appearAt, appearAt + 0.03, 0.92, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(
          cycle.value,
          [appearAt, appearAt + 0.04, appearAt + 0.07],
          [0.3, 1.15, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  return <Animated.View style={[styles.slot, popStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  slot: { marginLeft: -6 },
});
