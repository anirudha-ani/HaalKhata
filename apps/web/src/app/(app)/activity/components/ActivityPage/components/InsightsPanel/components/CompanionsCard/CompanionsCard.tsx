"use client";
/** Companions card: the people the person shared the most expenses with. */

import type { Companion } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList/BarList";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { countLabel } from "@haalkhata/shared/analytics/insights";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders the people the person split with most over the window. Each row
 * leads to the shared ledger with that person, like every other name in the
 * app.
 *
 * @param props - Component props.
 * @returns The card, or nothing when they split with nobody.
 */
export function CompanionsCard({
  companions,
}: {
  /** The people, most shared expenses first. */
  companions: readonly Companion[];
}) {
  if (companions.length === 0) return null;
  return (
    <InsightCard title="Who you split with" subtitle="By expenses you were both on.">
      <BarList
        rows={companions.map((companion) => ({
          key: companion.userId,
          leading: <Avatar user={{ ...companion, id: companion.userId }} size="sm" />,
          label: companion.name,
          value: companion.sharedExpenseCount,
          valueLabel: countLabel(companion.sharedExpenseCount, "expense"),
          href: `/friends/${companion.userId}`,
        }))}
      />
    </InsightCard>
  );
}
