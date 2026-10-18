/** The pressed-in feel shared by the app's buttons: a small spring scale, or only a dim under Reduce Motion. */

import { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { PRESS_OPACITY, PRESS_SCALE, PRESS_SPRING } from "../motion.constants";
import { useReduceMotion } from "./useReduceMotion";

/**
 * Drives a button's response to touch on the UI thread, so it follows the
 * finger even while JavaScript is busy (a mutation starting, a list
 * rendering). Under Reduce Motion the scale is dropped and only the dim
 * remains, which still says "this was pressed".
 *
 * @returns The animated style for the pressable and its press handlers.
 */
export function usePressFeedback() {
  const reduceMotion = useReduceMotion();
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * (1 - PRESS_OPACITY),
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * (1 - PRESS_SCALE) }],
  }));
  return {
    animatedStyle,
    onPressIn: () => {
      pressed.value = withSpring(1, PRESS_SPRING);
    },
    onPressOut: () => {
      pressed.value = withSpring(0, PRESS_SPRING);
    },
  };
}
