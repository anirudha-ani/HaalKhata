/** Consistent touch feedback for small controls, with UI-thread motion and a reduced-motion dim. */

import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { usePressFeedback } from "@/lib/motion/hooks/usePressFeedback";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Gives chips, tabs and icon controls the same quiet press response as action buttons.
 * Native press handlers and accessibility properties pass through unchanged.
 * @param props Native pressable properties and its static layout styles.
 * @returns An animated control that releases immediately when disabled.
 */
export function FeedbackPressable({
  style,
  disabled = false,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> }) {
  const feedback = usePressFeedback(disabled ?? false);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        feedback.onPressIn();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        feedback.onPressOut();
        onPressOut?.(event);
      }}
      style={[style, feedback.animatedStyle]}
    />
  );
}
