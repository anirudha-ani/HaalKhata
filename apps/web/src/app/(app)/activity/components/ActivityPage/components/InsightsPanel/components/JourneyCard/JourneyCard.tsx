"use client";
/** Journey card: how long the person has been here and what they have done in total. */

import type { Journey } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { StatTile } from "@/components/charts/StatTile/StatTile";
import {
  calendarDayLabel,
  memberDuration,
  memberSinceLabel,
} from "@haalkhata/shared/analytics/insights";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders the person's lifetime figures as a row of stat tiles. These are
 * totals since they joined; the period chosen below does not change them,
 * which is why this card sits above that control rather than under it.
 *
 * @param props - Component props.
 * @returns The card.
 */
export function JourneyCard({
  journey,
  className = "",
}: {
  /** The person's lifetime figures. */
  journey: Journey;
  /** Extra classes for the card, e.g. a grid span. */
  className?: string;
}) {
  const since = memberSinceLabel(journey.memberSince);
  const firstExpense = calendarDayLabel(journey.firstExpenseDate);
  return (
    <InsightCard
      title="Your journey"
      subtitle={since ? `On HaalKhata since ${since}` : undefined}
      className={className}
    >
      <div className="grid grid-cols-2 gap-2 @md:grid-cols-3 @3xl:grid-cols-6">
        <StatTile label="Member for" value={memberDuration(journey.memberSince) || "—"} />
        <StatTile
          label="Expenses"
          value={journey.expenseCount.toLocaleString()}
          hint={firstExpense ? `First: ${firstExpense}` : undefined}
        />
        <StatTile label="Payments" value={journey.paymentCount.toLocaleString()} />
        <StatTile label="Groups" value={journey.groupCount.toLocaleString()} />
        <StatTile label="Friends" value={journey.friendCount.toLocaleString()} />
        <StatTile label="Receipts scanned" value={journey.receiptScanCount.toLocaleString()} />
      </div>
    </InsightCard>
  );
}
