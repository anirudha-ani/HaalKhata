"use client";
/** Hook reporting whether a CSS media query currently matches. */

import { useCallback, useSyncExternalStore } from "react";

/**
 * Snapshot React reads on the server and during the hydration render, where
 * there is no viewport to ask.
 *
 * @returns Always false: nothing matches until the browser says so.
 */
function noViewportYet(): boolean {
  return false;
}

/**
 * Reports whether `query` matches, and re-renders when that changes (a
 * rotated phone, a resized window).
 *
 * For the cases CSS cannot reach: a breakpoint that changes behaviour or
 * state rather than only what is painted. Anything a Tailwind variant can
 * express should stay a variant.
 *
 * `useSyncExternalStore` rather than a state-setting effect, for the same
 * reason as `useHydrated`: the hydration render reproduces the server's
 * output, and the first client render already has the real answer.
 *
 * @param query - The media query, e.g. "(width < 40rem)".
 * @returns Whether the query matches; false on the server and while hydrating.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    noViewportYet,
  );
}
