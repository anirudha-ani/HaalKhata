"use client";
/** Activity page: searchable, filterable, day-grouped feed with keyset pagination. */

import Link from "next/link";
import { Bell, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchField } from "@/components/ui/SearchField";
import { Spinner } from "@/components/ui/Spinner";
import { formatMoney } from "@haalkhata/shared/money/money";
import { ACTIVITY_FILTERS, activityLook } from "../../constants/activityTypes";
import { groupByDay, monthLabel, timeOfDay, withoutAmount } from "../../utils/activityFormat";
import { ActivityGlyph } from "./components/ActivityGlyph/ActivityGlyph";
import { useActivity } from "./hooks/useActivity";

/** One event as the feed renders it, plus the day heading it falls under. */
type FeedEvent = ReturnType<typeof useActivity>["visibleEvents"][number];

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
  if (activity.isLoading) return <Spinner label="Loading activity…" />;

  const dayGroups = groupByDay(activity.visibleEvents, new Date());
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
            dayGroups.map((group) => (
              <section key={group.heading}>
                <h2 className="px-1 pt-3 pb-1.5 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                  {group.heading}
                </h2>
                <ul className="space-y-1.5">
                  {group.events.map((event) => (
                    <li key={event.id}>
                      <ActivityRow event={event} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
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

/**
 * Renders one feed row: the type tile, the sentence, its context line, and
 * the amount as a right-aligned figure.
 *
 * @param props - Component props.
 * @returns The row.
 */
function ActivityRow({ event }: { event: FeedEvent }) {
  const look = activityLook(event.type, event.inbound);
  const isSettlement = event.type === "settlement";
  const when = timeOfDay(event.createdAt);

  return (
    <Link
      href={event.link || "#"}
      className="group flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5 transition-colors hover:border-brand-200 hover:shadow-sm"
    >
      {/* The drawing is decoration; the tile carries the accessible name so a
          screen reader announces the kind of event, not the picture. */}
      <span
        role="img"
        aria-label={look.label}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 group-hover:-rotate-6 group-hover:scale-110 ${look.tile}`}
      >
        <ActivityGlyph name={look.glyph} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">
          {withoutAmount(event.message, event.amountCents, event.currency)}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
          {event.actor ? <Avatar user={event.actor} size="xsmall" /> : null}
          {when}
          {look.tag ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate font-medium">{look.tag}</span>
            </>
          ) : null}
        </span>
      </span>

      {event.amountCents > 0 ? (
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            isSettlement ? (event.inbound ? "text-pos-700" : "text-ink") : "text-ink-soft"
          }`}
        >
          {/* Signed only for settlements, where the direction is the point.
              An expense's amount is the whole bill, not your share, so a sign
              would claim something untrue. */}
          {isSettlement ? (event.inbound ? "+" : "−") : ""}
          {formatMoney(event.amountCents, event.currency || "USD")}
        </span>
      ) : null}
    </Link>
  );
}
