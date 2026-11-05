/** The fold dividing the window right now, for content that must keep off the crease. */

import { useEffect, useState } from "react";
import { useWindowDimensions } from "react-native";
import { foldModule, type FoldRegion } from "@/lib/fold/foldModule";

/**
 * Follows where the display folds, if anywhere. It asks again whenever the
 * window changes size, since opening, closing or turning the device moves
 * the fold, and takes each report the native side sends as the hinge moves.
 * Without a fold reporter, or when asking fails, the window counts as
 * unfolded.
 *
 * @returns The fold, in window points, or null when nothing divides the window.
 */
export function useFoldRegion(): FoldRegion | null {
  const { width, height } = useWindowDimensions();
  const [fold, setFold] = useState<FoldRegion | null>(null);
  useEffect(() => {
    if (!foldModule) return undefined;
    let current = true;
    foldModule.getFold().then(
      (region) => {
        if (current) setFold(region ?? null);
      },
      () => {
        if (current) setFold(null);
      },
    );
    const subscription = foldModule.addListener("onFoldChange", (event) => setFold(event.fold ?? null));
    return () => {
      current = false;
      subscription.remove();
    };
  }, [width, height]);
  return fold;
}
