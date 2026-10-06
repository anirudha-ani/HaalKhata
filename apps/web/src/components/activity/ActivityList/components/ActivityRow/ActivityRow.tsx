"use client";
/** Activity row: one feed event as a linked row with its type tile, sentence, context line and amount. */

import Link from "next/link";
import type { ActivityEvent } from "@haalkhata/protogen/social/v1/social_pb";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { formatMoney } from "@haalkhata/shared/money/money";
import { safeActivityPath } from "@haalkhata/shared/navigation/activityPath";
import { activityLook } from "../../utils/activityLook";
import { timeOfDay, withoutAmount } from "@haalkhata/shared/activity/format";
import { ActivityGlyph } from "../../../ActivityGlyph/ActivityGlyph";

/**
 * Renders one feed row: the type tile, the sentence, its context line, and
 * the amount as a right-aligned figure.
 *
 * @param props - Component props.
 * @returns The row.
 */
export function ActivityRow({ event }: { event: ActivityEvent }) {
  const look = activityLook(event.type, event.inbound);
  const isSettlement = event.type === "settlement";
  const when = timeOfDay(event.createdAt);

  return (
    <Link
      href={safeActivityPath(event.link)}
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
