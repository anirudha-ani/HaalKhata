"use client";
/** Group activity tab: the group's own feed, day-grouped, with keyset load-more. */

import { Bell } from "lucide-react";
import type { ActivityEvent } from "@haalkhata/protogen/social/v1/social_pb";
import { ActivityList } from "@/components/activity/ActivityList/ActivityList";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert/ErrorAlert";
import { LoadMoreFooter } from "@/components/ui/LoadMoreFooter/LoadMoreFooter";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { LIST_END_LINE } from "@haalkhata/shared/api/paging";

/**
 * Renders the activity tab of a group: what happened here *that concerns the
 * viewer* — their expenses and payments, plus the group's structural events
 * (people joining, settings) — as the same day-grouped feed the global
 * activity page draws, scoped to one ledger. Transactions between two other
 * members are their feed lines, not the room's; the server's audience rule
 * enforces that, this panel just renders what it is given.
 *
 * A failed read is said where its rows would be — in place of the feed when
 * nothing loaded, just above Show me more when the next page did not — so
 * it is never mistaken for an empty feed.
 *
 * @param props - Component props.
 * @returns The group's feed, a spinner while it loads, why it did not load,
 *   or an empty state.
 */
export function ActivityPanel({
  events,
  isLoading,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  error,
  onRetry,
  loadMoreError,
}: {
  /** The group's feed events, newest first. */
  events: ActivityEvent[];
  /** True while the first page is still loading. */
  isLoading: boolean;
  /** Whether the server has older events beyond what is loaded. */
  hasMore?: boolean;
  /** True while an older page is being fetched; disables the button. */
  isLoadingMore?: boolean;
  /** Fetches the next (older) page. */
  onLoadMore: () => void;
  /** Why the feed could not be read; "" when it was. */
  error: string;
  /** Reads the feed again from the top. */
  onRetry: () => void;
  /** Why the next page did not load; "" when it did. */
  loadMoreError: string;
}) {
  if (isLoading) return <Spinner label="Loading activity…" />;
  if (error) return <ErrorAlert message={`Couldn't load this group's activity: ${error}`} onRetry={onRetry} />;

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Bell />}
        title="Nothing yet"
        hint="Your expenses and payments in this group, and people joining it, will show up here."
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <ActivityList events={events} now={new Date()} />
      <LoadMoreFooter
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
        error={loadMoreError}
        endLabel={LIST_END_LINE}
      />
    </div>
  );
}
