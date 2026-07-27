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
 * Pages under a `loading.tsx` boundary are streamed, so React hydrates them
 * *after* the root has committed — by which time the `Providers` effect has
 * restored the TanStack Query cache from localStorage. A query the server
 * rendered as pending can therefore already hold data when the page hydrates,
 * and a tree that branches on it ("spinner" server-side, "content" client-side)
 * is a hydration mismatch: React discards the whole subtree and re-renders it.
 *
 * Gating that branch on this hook makes the hydration render reproduce the
 * server's output exactly; the cached data lands on the very next render. It
 * covers everything below the gate that the server cannot reproduce either —
 * `new Date()`, `toLocaleTimeString`, the user's timezone and locale.
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
