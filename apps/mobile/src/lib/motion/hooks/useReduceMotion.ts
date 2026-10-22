/** Whether the person asked iOS to reduce motion, kept current while the app runs. */

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Reads Settings → Accessibility → Motion → Reduce Motion and follows it
 * when it changes. Reanimated's own hook reads it once at launch, which
 * would keep sliding things at someone who has just turned motion off.
 *
 * Under Reduce Motion the app swaps movement for a short fade rather than
 * dropping the transition: a screen that changes with no transition at all
 * reads as a glitch.
 *
 * @returns True while Reduce Motion is on.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduced(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
