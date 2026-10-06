/** Reports whether a scroll view has content beyond its start and end edges, for cues that it scrolls at all. */

import { useCallback, useState } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { SCROLL_EDGE_TOLERANCE, SCROLL_EVENT_THROTTLE_MS } from "./scrollEdges.constants";

/**
 * Tracks whether a ScrollView has content hidden before its start edge and
 * after its end edge, along one axis. Callers draw a cue at an edge that has
 * more behind it, which is what tells a person that a list scrolls at all;
 * an unscrolled list with a hard edge looks complete.
 *
 * Wire the returned handlers to the ScrollView's `onLayout`,
 * `onContentSizeChange` and `onScroll`, and pass `scrollEventThrottle`.
 *
 * @param axis - Which way the view scrolls.
 * @returns The two edge flags and the handlers to attach.
 */
export function useScrollEdges(axis: "x" | "y") {
  const [viewportSize, setViewportSize] = useState(0);
  const [contentSize, setContentSize] = useState(0);
  const [offset, setOffset] = useState(0);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setViewportSize(axis === "y" ? height : width);
    },
    [axis],
  );
  const onContentSizeChange = useCallback(
    (width: number, height: number) => setContentSize(axis === "y" ? height : width),
    [axis],
  );
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { x: offsetX, y: offsetY } = event.nativeEvent.contentOffset;
      setOffset(axis === "y" ? offsetY : offsetX);
    },
    [axis],
  );

  return {
    beforeStart: offset > SCROLL_EDGE_TOLERANCE,
    afterEnd: offset + viewportSize < contentSize - SCROLL_EDGE_TOLERANCE,
    onLayout,
    onContentSizeChange,
    onScroll,
    scrollEventThrottle: SCROLL_EVENT_THROTTLE_MS,
  };
}
