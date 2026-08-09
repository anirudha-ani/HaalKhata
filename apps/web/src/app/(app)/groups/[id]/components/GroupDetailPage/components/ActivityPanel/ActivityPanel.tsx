"use client";
/** Group activity tab: the group's own feed, day-grouped, with keyset load-more. */

import { Bell, ChevronDown } from "lucide-react";
import type { ActivityEvent } from "@haalkhata/protogen/social/v1/social_pb";
import { ActivityList } from "@/components/activity/ActivityList";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Renders the activity tab of a group: everything that happened in this
 * group — expenses added and edited, payments, people joining, the
 * simplify-debts switch — as the same day-grouped feed the global activity
 * page draws, scoped to one ledger. The feed is how a shared ledger stays
 * trustworthy: every number on the other two tabs got there through some
 * event listed here.
 *
 * @param props - Component props.
 * @returns The group's feed, a spinner while it loads, or an empty state.
 */
export function ActivityPanel({
  events,
  isLoading,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
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
}) {
  if (isLoading) return <Spinner label="Loading activity…" />;

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Bell />}
        title="Nothing yet"
        hint="Expenses, payments and people joining this group will show up here."
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <ActivityList events={events} now={new Date()} />
      {hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-card py-3 text-sm font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50"
        >
          <ChevronDown className="h-4 w-4" />
          {isLoadingMore ? "Loading…" : "Show me more"}
        </button>
      ) : null}
    </div>
  );
}
