"use client";
/** Activity feed: searchable, filterable, day-grouped events with keyset pagination. */

import { Bell, ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { SearchField } from "@/components/ui/SearchField/SearchField";
import { ActivityList } from "@/components/activity/ActivityList/ActivityList";
import { ACTIVITY_FILTERS } from "@haalkhata/shared/activity/filters";
import { monthLabel } from "@haalkhata/shared/activity/format";
import type { useActivity } from "../../hooks/useActivity";
import { FeedError } from "./components/FeedError/FeedError";

/**
 * Renders the activity feed: search, a month window, type filters, and the
 * events grouped by day with a Load more button.
 *
 * Load more rather than infinite scroll: an audit trail is task-driven
 * reading, where an explicit control beats content that appears on its own.
 *
 * The feed's state lives in the page's `useActivity`, not here, so switching
 * to the insights view and back keeps the search, the filters and every
 * page already loaded.
 *
 * A failed read is said where its rows would be: in place of the whole
 * feed when nothing has loaded, above the rows when a reload failed, and
 * just above Load more when the next page did, so it is never mistaken
 * for an empty history and never lands below a long list.
 *
 * @param props - Component props.
 * @returns The feed.
 */
export function ActivityFeed({
  activity,
}: {
  /** The feed's data and controls, from the page's `useActivity`. */
  activity: ReturnType<typeof useActivity>;
}) {
  const isFiltered =
    activity.query !== "" || activity.filter !== "all" || activity.month !== "";

  if (activity.events.length === 0 && !isFiltered) {
    return activity.loadError ? (
      <FeedError
        message={`Couldn't load your activity: ${activity.loadError}`}
        onRetry={activity.retry}
      />
    ) : (
      <EmptyState
        icon={<Bell />}
        title="It's giving empty"
        hint="Expenses, payments and group drama involving you will land here."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <SearchField
            value={activity.query}
            onChange={activity.setQuery}
            placeholder="Search activity"
          />
        </div>
        {activity.months.length > 0 ? (
          <select
            aria-label="Month"
            value={activity.month}
            onChange={(event) => activity.setMonth(event.target.value)}
            className="max-w-[45%] shrink-0 rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-ink focus:border-brand-500 focus:outline-none"
          >
            <option value="">All time</option>
            {activity.months.map((monthKey) => (
              <option key={monthKey} value={monthKey}>
                {monthLabel(monthKey)}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {/* Filter state has to stay visible while it hides rows, so the
          active button is styled, not just remembered. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ACTIVITY_FILTERS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            aria-pressed={activity.filter === entry.value}
            onClick={() => activity.setFilter(entry.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activity.filter === entry.value
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-line text-ink-soft hover:border-brand-200"
            }`}
          >
            {entry.label}
          </button>
        ))}
        {activity.visibleEvents.length !== activity.events.length ? (
          <span className="ml-auto text-sm text-ink-soft tabular-nums">
            {activity.visibleEvents.length} of {activity.events.length} loaded
          </span>
        ) : null}
      </div>

      {activity.loadError && !activity.loadMoreFailed ? (
        <FeedError
          message={`Couldn't load your activity: ${activity.loadError}`}
          onRetry={activity.retry}
        />
      ) : null}

      {activity.visibleEvents.length > 0 ? (
        <ActivityList events={activity.visibleEvents} now={new Date()} />
      ) : activity.loadError ? null : (
        <p className="rounded-2xl border border-line bg-card px-4 py-8 text-center text-sm text-ink-soft">
          Crickets. Nothing matches that.
        </p>
      )}

      {activity.loadMoreFailed ? (
        <FeedError message={`Couldn't load more: ${activity.loadError}`} />
      ) : null}

      {activity.hasMore ? (
        <button
          type="button"
          onClick={activity.loadMore}
          disabled={activity.isLoadingMore}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-card py-3 text-sm font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50"
        >
          <ChevronDown className="h-4 w-4" />
          {activity.isLoadingMore ? "Loading…" : "Show me more"}
        </button>
      ) : activity.events.length > 0 ? (
        <p className="pb-2 text-center text-xs text-ink-soft">
          You&apos;ve hit the bottom{activity.month ? ` of ${monthLabel(activity.month)}` : ""}.
        </p>
      ) : null}
    </div>
  );
}
