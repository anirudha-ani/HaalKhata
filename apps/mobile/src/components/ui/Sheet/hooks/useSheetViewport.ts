/** Measures the space a dialog actually has after safe areas and keyboard avoidance. */

import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { SHEET_PINNED_CHROME_MIN_HEIGHT } from "../constants/sheet";

/**
 * Keeps dialog controls reachable when a keyboard or large text leaves too
 * little height to pin the title and actions. Measuring inside the keyboard
 * avoiding view handles keyboard changes and folding without remounting inputs.
 *
 * @param initialHeight - Available height before the first native layout.
 * @param fontScale - Current system text scale.
 * @returns A layout listener and whether the title and actions must scroll with the form.
 */
export function useSheetViewport(initialHeight: number, fontScale: number) {
  const [height, setHeight] = useState<number | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height);
  }, []);
  return {
    onLayout,
    scrollChrome: (height ?? initialHeight) / Math.max(1, fontScale) < SHEET_PINNED_CHROME_MIN_HEIGHT,
  };
}
