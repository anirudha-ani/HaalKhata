/** Where a sheet goes while the window is folded: wholly on one side of the fold. */

import type { EdgeInsets } from "react-native-safe-area-context";
import type { FoldRegion } from "@/lib/fold/foldModule";

/** How far, from each edge of the window, the sheet must stay to keep off the fold. */
export interface FoldClearance {
  /** Room to leave above the sheet. */
  top: number;
  /** Room to leave below it. */
  bottom: number;
  /** Room to leave on its left. */
  left: number;
  /** Room to leave on its right. */
  right: number;
}

/** No fold: nothing to keep clear of. */
const UNFOLDED: FoldClearance = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Keeps the sheet wholly on one side of a fold rather than across the
 * crease, where its words bend away and a tap can land on the hinge.
 *
 * The sheet takes the side with more room once the system's own bars are
 * counted out: iPhone Duo held wide keeps its status bar down the right
 * edge, so the left half of a book has more room than the right. A fold
 * across the window (held upright and standing half open, like a laptop)
 * puts the sheet below it when the two sides are equal: the lower half is
 * the one lying flat, within reach. A fold down the window (held wide and
 * half open, like a book) puts it on the right when they are equal.
 *
 * @param window - The window's size in points.
 * @param fold - Where the window is divided, or null when it is not.
 * @param insets - The safe-area insets, which take room from the side they sit on.
 * @param margin - Room to keep between the sheet and the fold.
 * @returns How far the sheet must stay from each edge of the window.
 */
export function clearOfFold(
  window: { width: number; height: number },
  fold: FoldRegion | null,
  insets: EdgeInsets,
  margin: number,
): FoldClearance {
  if (!fold) return UNFOLDED;
  if (fold.width >= fold.height) {
    const above = fold.y - insets.top;
    const below = window.height - (fold.y + fold.height) - insets.bottom;
    return below >= above
      ? { ...UNFOLDED, top: fold.y + fold.height + margin }
      : { ...UNFOLDED, bottom: window.height - fold.y + margin };
  }
  const before = fold.x - insets.left;
  const after = window.width - (fold.x + fold.width) - insets.right;
  return after >= before
    ? { ...UNFOLDED, left: fold.x + fold.width + margin }
    : { ...UNFOLDED, right: window.width - fold.x + margin };
}
