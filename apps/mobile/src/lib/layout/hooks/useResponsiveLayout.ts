/** Reactive mobile-layout breakpoints shared by screens and navigation chrome. */

import { useWindowDimensions } from "react-native";
import {
  EXPANDED_LAYOUT_BREAKPOINT,
  LARGE_TEXT_SCALE,
  TABLET_BREAKPOINT,
} from "@/lib/layout/constants/layout";

/** Responsive capabilities derived from the current window, including rotation and split view. */
export interface ResponsiveLayout {
  /** True when the current window is wide enough for tablet navigation. */
  isTablet: boolean;
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
 * Window width is used instead of device identity so iPad split view and
 * Android multi-window collapse naturally to the phone layout when needed.
 *
 * @returns The current tablet and expanded-layout flags plus viewport width.
 */
export function useResponsiveLayout(): ResponsiveLayout {
  const { width, fontScale } = useWindowDimensions();
  return {
    isExpanded: width / Math.max(1, fontScale) >= EXPANDED_LAYOUT_BREAKPOINT,
    isTablet: width >= TABLET_BREAKPOINT,
    isLargeText: fontScale >= LARGE_TEXT_SCALE,
    fontScale,
    width,
  };
}
