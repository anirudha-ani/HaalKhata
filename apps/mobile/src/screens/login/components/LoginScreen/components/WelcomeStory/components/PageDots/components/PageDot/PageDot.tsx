/** One page dot, stretching into the current-page pill as its page scrolls into view. */

import { Pressable, StyleSheet } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { colors, radii } from "@/lib/theme/theme";
import { PAGE_DOT_ACTIVE_WIDTH, PAGE_DOT_SIZE } from "@/screens/login/constants/welcome";

/**
 * Widens the dot into the pill as its page arrives. The width animates on
 * the UI thread from the live offset; scaling a pill instead would squash
 * its round ends. Three dots relaying out is no cost worth avoiding.
 *
 * @param props - Component props.
 * @returns The dot.
 */
export function PageDot({
  index,
  pageWidth,
  scrollX,
  onPress,
}: {
  index: number;
  pageWidth: number;
  /** The pager's live scroll offset. */
  scrollX: SharedValue<number>;
  onPress: () => void;
}) {
  const dotStyle = useAnimatedStyle(() => {
    const position = pageWidth > 0 ? scrollX.value / pageWidth : 0;
    const nearness = interpolate(position, [index - 1, index, index + 1], [0, 1, 0], Extrapolation.CLAMP);
    return {
      opacity: 0.3 + 0.7 * nearness,
      width: PAGE_DOT_SIZE + (PAGE_DOT_ACTIVE_WIDTH - PAGE_DOT_SIZE) * nearness,
    };
  });
  return (
    <Pressable accessible={false} hitSlop={10} onPress={onPress}>
      <Animated.View style={[styles.pageDot, dotStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pageDot: {
    backgroundColor: colors.brand600,
    borderRadius: radii.full,
    height: PAGE_DOT_SIZE,
    width: PAGE_DOT_SIZE,
  },
});
