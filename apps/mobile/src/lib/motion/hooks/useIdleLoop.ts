/** A repeating 0→1 clock for an illustration that plays while it is on screen. */

import { useEffect } from "react";
import { cancelAnimation, Easing, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { IDLE_LOOP_MS } from "../motion.constants";
import { useReduceMotion } from "./useReduceMotion";

/**
 * Runs a looping clock on the UI thread while `active`, so an illustration
 * can derive every moving part from one value. Off screen, or under Reduce
 * Motion (Apple asks apps to drop automatic, repeating animation there), the
 * clock rests on `restAt`: a frame chosen to show the finished picture.
 *
 * @param active - Whether the illustration is the one being looked at.
 * @param restAt - The clock value that shows the complete, still picture.
 * @param durationMs - Length of one loop.
 * @returns The shared clock value.
 */
export function useIdleLoop(active: boolean, restAt: number, durationMs: number = IDLE_LOOP_MS) {
  const reduceMotion = useReduceMotion();
  const cycle = useSharedValue(restAt);
  useEffect(() => {
    if (!active || reduceMotion) {
      cancelAnimation(cycle);
      cycle.value = restAt;
      return undefined;
    }
    cycle.value = 0;
    cycle.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(cycle);
  }, [active, reduceMotion, restAt, durationMs, cycle]);
  return cycle;
}
