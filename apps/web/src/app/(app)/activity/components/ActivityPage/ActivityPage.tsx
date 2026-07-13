"use client";
/** Activity page: cross-group event feed with per-type icons and actor avatars. */

import Link from "next/link";
import { Bell } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { TYPE_EMOJI } from "../../constants/typeEmoji";
import { useActivity } from "./hooks/useActivity";

/**
 * Renders the activity feed: a spinner while loading, an empty state when
 * there are no events, otherwise a linked list of activity events with
 * per-type emoji, actor avatar, message, and date.
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
        <ul className="space-y-2">
          {activity.events.map((event) => (
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
      )}
    </div>
  );
}
