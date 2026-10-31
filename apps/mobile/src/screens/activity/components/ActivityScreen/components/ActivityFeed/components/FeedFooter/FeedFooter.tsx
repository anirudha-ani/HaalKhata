/** Feed footer: the Show me more button, why the last page did not load, or the bottom of the history. */

import { ShowMoreFooter } from "@/components/ui/ShowMoreFooter/ShowMoreFooter";
import { monthLabel } from "@haalkhata/shared/activity/format";
import type { useActivity } from "../../../../hooks/useActivity";

/**
 * Renders what sits under the rows, through the footer every paged list
 * shares: a failed next page is said just above Show me more, which is the
 * way to ask for it again, and the rows already loaded stay where they
 * are; once there is nothing further, a line says the bottom (of the
 * chosen month) was reached.
 *
 * @param props - The feed's data and controls, from the screen's `useActivity`.
 * @returns The footer, or nothing for a feed with no rows and no more to load.
 */
export function FeedFooter({ activity }: { activity: ReturnType<typeof useActivity> }) {
  return (
    <ShowMoreFooter
      hasMore={activity.hasMore}
      isLoadingMore={activity.isLoadingMore}
      onShowMore={activity.loadMore}
      error={activity.loadMoreFailed ? activity.loadError : ""}
      endLine={
        activity.events.length > 0
          ? `You've hit the bottom${activity.month ? ` of ${monthLabel(activity.month)}` : ""}.`
          : ""
      }
    />
  );
}
