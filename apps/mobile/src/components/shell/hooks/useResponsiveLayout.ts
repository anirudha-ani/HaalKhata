/** Reactive mobile-layout breakpoints shared by screens and navigation chrome. */

import { useWindowDimensions } from "react-native";
import {
  EXPANDED_LAYOUT_BREAKPOINT,
  TABLET_BREAKPOINT,
} from "@/components/shell/shell.constants";

/** Responsive capabilities derived from the current window, including rotation and split view. */
export interface ResponsiveLayout {
  /** True when the current window is wide enough for tablet navigation. */
  isTablet: boolean;
  /** True when the current window can hold two useful content columns. */
  isExpanded: boolean;
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
  const { width } = useWindowDimensions();
  return {
    isExpanded: width >= EXPANDED_LAYOUT_BREAKPOINT,
    isTablet: width >= TABLET_BREAKPOINT,
    width,
  };
}
