/** How the primary navigation keeps each side of its bar clear of that side's own safe-area inset. */

import type { EdgeInsets } from "react-native-safe-area-context";
import { NAVIGATION_RAIL_WIDTH } from "@/lib/layout/constants/layout";

/** The side insets handed to the navigator, and the bar's own sizing that pads the rest. */
export interface NavigationInsets {
  /** Side insets for the navigator's `safeAreaInsets`, the only ones it pads the bar by. */
  navigatorInsets: { left: number; right: number };
  /** The bar's own width (the rail) or per-side padding (the bottom bar). */
  barStyle: { width: number } | { paddingStart: number; paddingEnd: number };
}

/**
 * Splits the window's side insets between the navigator and the bar's own
 * style so each side of the bar is padded by its own inset.
 *
 * The navigator pads a bottom bar's two sides by the larger side inset, which
 * on iPhone Duo's outer display (an 84-point status bar down one side)
 * squeezed every tab into the middle. So the bottom bar gets no side insets
 * from the navigator and pads its leading and trailing sides itself. That
 * holds whatever keys or order the navigator uses for its own padding, since
 * all it has to pad by is zero.
 *
 * The rail sits on the leading side: the left, or the right when the layout
 * runs right to left. It grows by that side's inset, and the navigator gets
 * that inset as both `left` and `right`, so the rail's start side is padded
 * correctly whichever of the two the navigator reads for it (today it reads
 * `left`, right to left included).
 *
 * @param insets - The window's safe-area insets.
 * @param isRail - Whether the bar is the rail beside the content rather than the bottom bar.
 * @param isRightToLeft - Whether the layout runs right to left, which puts the rail on the right.
 * @returns The navigator's side insets and the bar's own sizing.
 */
export function navigationInsets(insets: EdgeInsets, isRail: boolean, isRightToLeft: boolean): NavigationInsets {
  const leading = isRightToLeft ? insets.right : insets.left;
  const trailing = isRightToLeft ? insets.left : insets.right;
  return isRail
    ? { navigatorInsets: { left: leading, right: leading }, barStyle: { width: NAVIGATION_RAIL_WIDTH + leading } }
    : { navigatorInsets: { left: 0, right: 0 }, barStyle: { paddingStart: leading, paddingEnd: trailing } };
}
