"use client";
/** Shared activity feed list: day-grouped, linked rows with type tiles and amounts. */

import type { ActivityEvent } from "@haalkhata/protogen/social/v1/social_pb";
import { groupByDay } from "@haalkhata/shared/activity/format";
import { ActivityRow } from "./components/ActivityRow/ActivityRow";

/**
 * Renders feed events grouped by day — the list itself, without the search,
 * filter or pagination chrome around it — so the global activity page and a
 * group's activity tab draw their rows identically instead of each keeping a
 * private copy that drifts.
 *
 * @param props - Component props.
 * @returns One section per day, each a heading plus its rows.
 */
export function ActivityList({
  events,
  now,
}: {
  /** Feed events, newest first (the order the server returns them). */
  events: ActivityEvent[];
  /** The current time, for the Today/Yesterday headings. */
  now: Date;
}) {
  return (
    <>
      {groupByDay(events, now).map((group) => (
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
      ))}
    </>
  );
}
