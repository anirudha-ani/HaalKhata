"use client";
/** Activity page: cross-group event feed with per-type icons and actor avatars. */

import Link from "next/link";
import { Bell } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchField } from "@/components/ui/SearchField";
import { Spinner } from "@/components/ui/Spinner";
import { ACTIVITY_FILTERS, TYPE_EMOJI } from "../../constants/typeEmoji";
import { useActivity } from "./hooks/useActivity";

/**
 * Renders the activity feed: a spinner while loading, an empty state when
 * there are no events, otherwise a search box, the type filter buttons, and a
 * linked list of matching events with per-type emoji, actor avatar, message,
 * and date.
 *
 * @returns The activity page content.
 */
export function ActivityPage() {
  const activity = useActivity();
  if (activity.isLoading) return <Spinner label="Loading activity…" />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Activity</h1>

      {activity.events.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="Nothing yet"
          hint="Expenses, payments and group changes involving you will show up here."
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
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_FILTERS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                aria-pressed={activity.filter === entry.value}
                onClick={() => activity.setFilter(entry.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  activity.filter === entry.value
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-line text-ink-soft hover:border-brand-200"
                }`}
              >
                {entry.label}
              </button>
            ))}
            {activity.visibleEvents.length !== activity.events.length ? (
              <span className="ml-auto self-center text-sm text-ink-soft tabular-nums">
                {activity.visibleEvents.length} of {activity.events.length}
              </span>
            ) : null}
          </div>
          {activity.visibleEvents.length === 0 ? (
            <p className="rounded-xl border border-line bg-card px-4 py-6 text-center text-sm text-ink-soft">
              Nothing matches that.
            </p>
          ) : null}
        <ul className="space-y-2">
          {activity.visibleEvents.map((event) => (
            <li key={event.id}>
              <Link
                href={event.link || "#"}
                className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 hover:border-brand-200"
              >
                <span className="text-xl">{TYPE_EMOJI[event.type] ?? "📌"}</span>
                {event.actor ? <Avatar user={event.actor} size="sm" /> : null}
                <span className="min-w-0 flex-1 text-sm">{event.message}</span>
                <span className="shrink-0 text-xs text-ink-soft">
                  {event.createdAt.slice(0, 10)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}
