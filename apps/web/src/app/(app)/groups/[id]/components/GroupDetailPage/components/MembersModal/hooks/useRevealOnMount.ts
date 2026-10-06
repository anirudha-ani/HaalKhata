"use client";
/** Hook that scrolls an element into view as it appears. */

import { useEffect, useRef } from "react";

/**
 * Returns a ref for an element that should be on screen the moment it is
 * rendered: a row's confirmation, its refusal, or the outcome of its action.
 *
 * These appear under the row that was tapped, and when that row is the last
 * one visible they would land just below the fold of the scrolling list —
 * feedback nobody sees is no feedback. `block: "nearest"` moves the list
 * only as far as it must, and not at all when the element already fits.
 * Give the element a scroll margin (`scroll-my-5`) so it is not left
 * touching the edge of the list, under a phone's bottom bar.
 *
 * @returns The ref to attach to the element.
 */
export function useRevealOnMount<Element extends HTMLElement>() {
  const elementRef = useRef<Element>(null);
  useEffect(() => {
    elementRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  return elementRef;
}
