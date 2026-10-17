/** Paging state for the welcome steps: which page shows, the live scroll offset, and moving between pages. */

import { useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from "react-native";
import { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";

/**
 * Drives a horizontal, person-paced pager. Nothing advances on its own:
 * auto-advancing takes control away from the reader, and anything that
 * moves for more than a few seconds needs a pause (WCAG 2.2.2).
 *
 * The scroll offset lives in a shared value written on the UI thread, so the
 * dots and the parallax follow the finger without crossing to JavaScript.
 * The settled page is React state, used to start the visible page's
 * illustration and to tell VoiceOver where it is. A rotation or a resized
 * iPad window keeps the same page in view.
 *
 * @param pageCount - Number of pages.
 * @returns The scroll ref and handlers for the pager, its measured page
 *   width, the live offset, the settled page, and `goTo`.
 */
export function useStoryPager(pageCount: number) {
  const reduceMotion = useReduceMotion();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollX = useSharedValue(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // A new width (rotation, Split View) puts the same page back in view.
  useEffect(() => {
    if (pageWidth > 0) scrollRef.current?.scrollTo({ x: pageRef.current * pageWidth, animated: false });
  }, [pageWidth]);

  /**
   * Clamps and records the settled page.
   *
   * @param index - The page to settle on.
   * @returns The clamped page.
   */
  const settle = (index: number): number => {
    const clamped = Math.min(Math.max(0, index), pageCount - 1);
    pageRef.current = clamped;
    setPage(clamped);
    return clamped;
  };

  return {
    scrollRef,
    scrollX,
    pageWidth,
    page,
    onScroll,
    /** @param event - The pager's layout, which sets the page width. */
    onLayout: (event: LayoutChangeEvent) => setPageWidth(Math.round(event.nativeEvent.layout.width)),
    /** @param event - The settled scroll position after a swipe. */
    onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth > 0) settle(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
    },
    /**
     * Shows a page, sliding to it unless Reduce Motion is on.
     *
     * @param index - The page to show.
     */
    goTo: (index: number) => {
      const target = settle(index);
      scrollRef.current?.scrollTo({ x: target * pageWidth, animated: !reduceMotion });
    },
  };
}
