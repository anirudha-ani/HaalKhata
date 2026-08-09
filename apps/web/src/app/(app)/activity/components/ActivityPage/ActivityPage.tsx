"use client";
/** Activity page: searchable, filterable, day-grouped feed with keyset pagination. */

import { Bell, ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchField } from "@/components/ui/SearchField";
import { Spinner } from "@/components/ui/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { ActivityList } from "@/components/activity/ActivityList";
import { ACTIVITY_FILTERS } from "@/components/activity/activityTypes";
import { monthLabel } from "@/components/activity/activityFormat";
import { useActivity } from "./hooks/useActivity";

/**
 * Renders the activity feed: search, type filters, a month window, and the
 * events grouped by day with a Load more button.
 *
 * Load more rather than infinite scroll: an audit trail is task-driven
 * reading, where an explicit control beats content that appears on its own.
 *
 * @returns The activity page content.
 */
export function ActivityPage() {
  const activity = useActivity();
  const hydrated = useHydrated();
  if (!hydrated || activity.isLoading) return <Spinner label="Loading activity…" />;

  const isFiltered =
    activity.query !== "" || activity.filter !== "all" || activity.month !== "";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold">Activity</h1>
        {activity.months.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            Month
            <select
              value={activity.month}
              onChange={(event) => activity.setMonth(event.target.value)}
              className="rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            >
              <option value="">All time</option>
              {activity.months.map((monthKey) => (
                <option key={monthKey} value={monthKey}>
                  {monthLabel(monthKey)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {activity.events.length === 0 && !isFiltered ? (
        <EmptyState
          icon={<Bell />}
          title="It's giving empty"
          hint="Expenses, payments and group drama involving you will land here."
        />
      ) : (
        <>
          <SearchField
            value={activity.query}
            onChange={activity.setQuery}
            placeholder="Search activity"
          />

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

          {activity.visibleEvents.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card px-4 py-8 text-center text-sm text-ink-soft">
              Crickets. Nothing matches that.
            </p>
          ) : (
            <ActivityList events={activity.visibleEvents} now={new Date()} />
          )}

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
        </>
      )}
    </div>
  );
}
