/** Pull-to-refresh state that follows the person's pull, not every background refetch. */

import { useState } from "react";

/**
 * Holds the spinner state for a screen's pull-to-refresh. It is on from the
 * moment the person lets go until `reload` settles, and at no other time.
 *
 * Screens used to pass TanStack Query's `isRefetching` to the RefreshControl
 * instead. That flag is true for every background refetch: a query going
 * stale while another tab opens, the app coming back to the foreground, an
 * invalidation after a payment. Each of those drew the pull spinner and
 * pushed the screen down, though nobody had pulled — on every tab switch.
 * A background refetch updates the data quietly; a failed one still shows
 * through the screen's error state, as before.
 *
 * @param reload - Refetches everything the screen shows; resolves when all of it has settled.
 * @returns `refresh` for the RefreshControl's `onRefresh`, and `isRefreshing`
 *   for its `refreshing`.
 */
export function usePullToRefresh(reload: () => Promise<unknown>): {
  refresh: () => void;
  isRefreshing: boolean;
} {
  const [isRefreshing, setIsRefreshing] = useState(false);
  /** Shows the spinner until every refetch has settled, then hides it. */
  const refresh = () => {
    setIsRefreshing(true);
    // A refetch reports failure in its query's error state, which the screen
    // shows; the catch only keeps a rejected reload from going unhandled.
    void reload()
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  };
  return { refresh, isRefreshing };
}
