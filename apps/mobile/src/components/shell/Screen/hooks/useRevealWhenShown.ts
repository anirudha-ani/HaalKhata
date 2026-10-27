/** Keeping a control on screen when something appears just above it, inside the screen's scroll view. */

import { createContext, useContext, useEffect, useRef } from "react";
import type { HostInstance } from "react-native";

/**
 * Scrolls the enclosing Screen just far enough that the given view is
 * fully visible. Provided by Screen; outside one it does nothing.
 */
export const ScreenRevealContext = createContext<(target: HostInstance) => void>(() => undefined);

/**
 * Returns a ref for a view that must stay on screen when a message is put
 * inside it, above its button — a failed page's error above the Show more
 * that retries it.
 *
 * The message pushes the button down by its own height, so a button that
 * was the last thing visible lands below the edge and the way to try again
 * is hidden. Each time `shown` turns true the screen scrolls the view back
 * into sight, only as far as it must. A message that is already there when
 * the view first renders scrolls nothing: opening a screen must not jump
 * to its last row.
 *
 * @param shown - Whether the message is showing.
 * @returns The ref to attach to the view.
 */
export function useRevealWhenShown(shown: boolean) {
  const reveal = useContext(ScreenRevealContext);
  const targetRef = useRef<HostInstance>(null);
  const wasShown = useRef(shown);
  useEffect(() => {
    if (shown && !wasShown.current && targetRef.current) reveal(targetRef.current);
    wasShown.current = shown;
  }, [reveal, shown]);
  return targetRef;
}
