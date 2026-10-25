"use client";
/** Feed footer: the Load more button, why the last page did not load, or the bottom of the history. */

import { ChevronDown } from "lucide-react";
import { monthLabel } from "@haalkhata/shared/activity/format";
import type { useActivity } from "../../../../hooks/useActivity";
import { FeedError } from "../FeedError/FeedError";

/**
 * Renders what sits under the rows. A failed next page is said just above
 * Show me more, which is the way to ask for it again; once there is nothing
 * further, a line says the bottom was reached.
 *
 * @param props - Component props.
 * @returns The footer, or nothing for a feed with no rows and no more to load.
 */
export function FeedFooter({
  activity,
}: {
  /** The feed's data and controls, from the page's `useActivity`. */
  activity: ReturnType<typeof useActivity>;
}) {
  if (!activity.hasMore) {
    return activity.events.length > 0 ? (
      <p className="pb-2 text-center text-xs text-ink-soft">
        You&apos;ve hit the bottom{activity.month ? ` of ${monthLabel(activity.month)}` : ""}.
      </p>
    ) : null;
  }

  return (
    <>
      {activity.loadMoreFailed ? (
        <FeedError message={`Couldn't load more: ${activity.loadError}`} />
      ) : null}
      <button
        type="button"
        onClick={activity.loadMore}
        disabled={activity.isLoadingMore}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-card py-3 text-sm font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50"
      >
        <ChevronDown className="h-4 w-4" />
        {activity.isLoadingMore ? "Loading…" : "Show me more"}
      </button>
    </>
  );
}
