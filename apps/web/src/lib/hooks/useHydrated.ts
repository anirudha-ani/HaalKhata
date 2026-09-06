"use client";
/** Hook reporting whether the client has finished hydrating the server HTML. */

import { useSyncExternalStore } from "react";

/**
 * Subscribes to a store that never emits — whether hydration has happened is
 * decided by React, not by an external source, so there is nothing to listen to.
 *
 * @returns An unsubscribe function that does nothing.
 */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * Snapshot React reads on the server and during the hydration render.
 *
 * @returns Always false — hydration has not finished yet.
 */
function notYetHydrated(): boolean {
  return false;
}

/**
 * Snapshot React reads once the client has taken over.
 *
 * @returns Always true.
 */
function alreadyHydrated(): boolean {
  return true;
}

/**
 * Reports `false` during the hydration render and `true` from the first
 * client-only render onwards.
 *
 * Gating browser-only branches on this hook makes the hydration render
 * reproduce the server's output exactly. It covers values the server cannot
 * reproduce, including `new Date()`, `toLocaleTimeString`, the user's timezone
 * and locale.
 *
 * `useSyncExternalStore` rather than a state-setting effect: React already
 * distinguishes the hydration render from the ones after it via the server
 * snapshot, so this needs no effect and no cascading re-render.
 *
 * @returns Whether hydration has completed.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeToNothing, alreadyHydrated, notYetHydrated);
}
