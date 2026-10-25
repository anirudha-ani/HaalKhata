/** The pressed-in feel shared by the app's buttons: a small spring scale, or only a dim under Reduce Motion. */

import { useEffect } from "react";
import { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { PRESS_SPRING } from "../motion.constants";
import { pressStyle } from "../pressStyle";
import { useReduceMotion } from "./useReduceMotion";

/**
 * Drives a button's response to touch on the UI thread, so it follows the
 * finger even while JavaScript is busy (a mutation starting, a list
 * rendering). Under Reduce Motion the scale is dropped and only the dim
 * remains, which still says "this was pressed".
 *
 * The disabled dim is part of the same animated style, never a static style
 * swapped in for it (see {@link pressStyle}). A button disabled mid-press,
 * which is every button whose press starts a request, is let go at once, so
 * it does not stay shrunk until it is enabled again.
 *
 * @param disabled - Whether the button cannot be pressed right now.
 * @returns The animated style for the pressable and its press handlers.
 */
export function usePressFeedback(disabled = false) {
  const reduceMotion = useReduceMotion();
  const pressed = useSharedValue(0);
  useEffect(() => {
    if (disabled) pressed.value = 0;
  }, [disabled, pressed]);
  const animatedStyle = useAnimatedStyle(
    () => pressStyle(pressed.value, disabled, reduceMotion),
    [disabled, reduceMotion],
  );
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
