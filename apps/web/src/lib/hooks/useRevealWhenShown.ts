"use client";
/** Hook that keeps a control on screen when something appears just above it. */

import { useEffect, useRef } from "react";

/**
 * Returns a ref for a control that must stay on screen when a message is
 * put above it — a failed page's error above the Show more that retries it.
 *
 * The message pushes the control down by its own height, so a control that
 * was the last thing visible lands below the fold, and the way to try again
 * is hidden. Each time `shown` turns true the control is scrolled back into
 * view; `block: "nearest"` moves the page only as far as it must, and not
 * at all when it already fits. A message that is already there when the
 * control first renders scrolls nothing: opening a page must not jump to
 * its last row. Give the element a scroll margin (`scroll-my-5`) so it is
 * not left touching the edge of the page.
 *
 * @param shown - Whether the message above the control is showing.
 * @returns The ref to attach to the control.
 */
export function useRevealWhenShown<Element extends HTMLElement>(shown: boolean) {
  const elementRef = useRef<Element>(null);
  const wasShown = useRef(shown);
  useEffect(() => {
    if (shown && !wasShown.current) {
      elementRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    wasShown.current = shown;
  }, [shown]);
  return elementRef;
}
