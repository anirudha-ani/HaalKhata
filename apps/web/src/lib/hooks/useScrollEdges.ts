"use client";
/** Reports whether a scroll container has content beyond its start and end edges, for fades and cues. */

import { useCallback, useEffect, useState, type RefObject } from "react";
import { SCROLL_EDGE_TOLERANCE_PX } from "./scrollEdges.constants";

/**
 * Tracks whether a scrollable element has content hidden before its start
 * edge and after its end edge, along one axis. Callers draw a fade or a
 * chevron at an edge that has more behind it, which is what tells a person
 * that a list scrolls at all; an unscrolled list with a hard edge looks
 * complete.
 *
 * Re-measures on resize through a ResizeObserver and whenever `contentKey`
 * changes; the caller wires `measure` to the element's `onScroll`.
 *
 * @param containerRef - The scroll container.
 * @param axis - Which way it scrolls.
 * @param contentKey - Any value that changes when the content does, so the
 *   edges are re-read after rows appear or vanish.
 * @returns Whether there is content before the start and after the end, and
 *   the `measure` function to call on scroll.
 */
export function useScrollEdges<Element extends HTMLElement>(
  containerRef: RefObject<Element | null>,
  axis: "x" | "y",
  contentKey: unknown,
) {
  const [edges, setEdges] = useState({ beforeStart: false, afterEnd: false });

  const measure = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const position = axis === "y" ? element.scrollTop : element.scrollLeft;
    const visible = axis === "y" ? element.clientHeight : element.clientWidth;
    const total = axis === "y" ? element.scrollHeight : element.scrollWidth;
    const beforeStart = position > SCROLL_EDGE_TOLERANCE_PX;
    const afterEnd = position + visible < total - SCROLL_EDGE_TOLERANCE_PX;
    setEdges((current) =>
      current.beforeStart === beforeStart && current.afterEnd === afterEnd
        ? current
        : { beforeStart, afterEnd },
    );
  }, [containerRef, axis]);

  useEffect(() => {
    measure();
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, containerRef, contentKey]);

  return { ...edges, measure };
}
