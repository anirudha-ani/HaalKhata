"use client";
/** Shared activity feed list: day-grouped, linked rows with type tiles and amounts. */

import Link from "next/link";
import type { ActivityEvent } from "@haalkhata/protogen/social/v1/social_pb";
import { Avatar } from "@/components/ui/Avatar";
import { formatMoney } from "@haalkhata/shared/money/money";
import { activityLook } from "./activityTypes";
import { groupByDay, timeOfDay, withoutAmount } from "./activityFormat";
import { ActivityGlyph } from "./ActivityGlyph";

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

/**
 * Renders one feed row: the type tile, the sentence, its context line, and
 * the amount as a right-aligned figure.
 *
 * @param props - Component props.
 * @returns The row.
 */
function ActivityRow({ event }: { event: ActivityEvent }) {
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
