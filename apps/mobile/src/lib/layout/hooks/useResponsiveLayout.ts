/** Reactive mobile-layout breakpoints shared by screens and navigation chrome. */

import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  EXPANDED_LAYOUT_BREAKPOINT,
  LARGE_TEXT_SCALE,
  LARGE_WINDOW_MIN_HEIGHT,
  LARGE_WINDOW_MIN_WIDTH,
  NAVIGATION_RAIL_WIDTH,
  SPACIOUS_CONTENT_MIN_WIDTH,
} from "@/lib/layout/constants/layout";

/** Responsive capabilities derived from the current window, including rotation and split view. */
export interface ResponsiveLayout {
  /**
   * True when the window is both wide and tall enough for the navigation
   * rail, centred dialogs and wrapped chips. An iPad window and iPhone Duo's
   * inner display are; a phone, held either way, is not.
   */
  isLargeWindow: boolean;
  /** True when the content, after the rail and the side insets, has room for tablet density. */
  isSpacious: boolean;
  /** True when the current window can hold two useful content columns. */
  isExpanded: boolean;
  /** Whether the user requests larger text that needs more horizontal room. */
  isLargeText: boolean;
  /** Current system text scale, used to reserve space for readable controls. */
  fontScale: number;
  /** Current window width in density-independent pixels. */
  width: number;
}

/**
 * Returns responsive capabilities for the current app window.
 *
 * The window's size is used instead of device identity so iPad split view,
 * Android multi-window and iPhone Duo opening and closing all collapse
 * naturally to the phone layout when needed. Density is decided by the room
 * left for the content, which is the window less the rail and the safe-area
 * insets on both sides.
 *
 * @returns The current large-window, spacious and expanded-layout flags plus viewport width.
 */
export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLargeWindow = width >= LARGE_WINDOW_MIN_WIDTH && height >= LARGE_WINDOW_MIN_HEIGHT;
  const contentWidth = width - insets.left - insets.right - (isLargeWindow ? NAVIGATION_RAIL_WIDTH : 0);
  return {
    isExpanded: width / Math.max(1, fontScale) >= EXPANDED_LAYOUT_BREAKPOINT,
    isLargeWindow,
    isSpacious: contentWidth >= SPACIOUS_CONTENT_MIN_WIDTH,
    isLargeText: fontScale >= LARGE_TEXT_SCALE,
    fontScale,
    width,
  };
}
