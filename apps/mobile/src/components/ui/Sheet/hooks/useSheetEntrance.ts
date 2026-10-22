/** The sheet's arrival: up from the bottom edge on a phone, a slight grow on iPad. */

import { useEffect } from "react";
import { useWindowDimensions } from "react-native";
import { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { DIALOG_START_SCALE, SHEET_SPRING } from "@/lib/motion/motion.constants";

/**
 * Animates the card while the modal itself fades the backdrop in, so the
 * dimming arrives as a fade and only the card travels — the way iOS presents
 * a sheet. A phone sheet rises from below the screen on a spring that never
 * overshoots (an overshoot would open a gap under it); a centered iPad
 * dialog grows from just under full size. Under Reduce Motion the card does
 * not move and the modal's fade is the whole transition.
 *
 * Runs on the UI thread, so a sheet opened while its content is still
 * rendering keeps moving smoothly.
 *
 * @param centered - Whether the sheet is a centered dialog (iPad) rather than a bottom sheet.
 * @returns The card's animated style.
 */
export function useSheetEntrance(centered: boolean) {
  const { height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(1, SHEET_SPRING);
  }, [progress]);

  return useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ translateY: 0 }, { scale: 1 }] };
    return centered
      ? { transform: [{ translateY: 0 }, { scale: DIALOG_START_SCALE + (1 - DIALOG_START_SCALE) * progress.value }] }
      : { transform: [{ translateY: (1 - progress.value) * height }, { scale: 1 }] };
  });
}
