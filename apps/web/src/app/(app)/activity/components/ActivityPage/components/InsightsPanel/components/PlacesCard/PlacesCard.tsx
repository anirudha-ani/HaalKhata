"use client";
/** Places card: which groups the person's expenses happened in. */

import type { GroupActivity } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList/BarList";
import {
  countLabel,
  OUTSIDE_GROUPS_EMOJI,
  OUTSIDE_GROUPS_LABEL,
} from "@haalkhata/shared/analytics/insights";
import { groupEmoji } from "@/app/(app)/groups/constants/groupTypes";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders the busiest places the person split in over the window: their
 * groups, plus one row for expenses outside any group. A group's row leads
 * to the group; the outside-groups row has nowhere of its own to lead.
 *
 * @param props - Component props.
 * @returns The card, or nothing when there were no expenses.
 */
export function PlacesCard({
  groups,
}: {
  /** The places, busiest first; an empty group id means outside any group. */
  groups: readonly GroupActivity[];
}) {
  if (groups.length === 0) return null;
  return (
    <InsightCard title="Where you split" subtitle="By number of expenses.">
      <BarList
        rows={groups.map((place) => {
          const outside = place.groupId === "";
          return {
            key: place.groupId || "outside",
            leading: (
              <span aria-hidden="true" className="text-lg leading-none">
                {outside ? OUTSIDE_GROUPS_EMOJI : groupEmoji(place.type)}
              </span>
            ),
            label: outside ? OUTSIDE_GROUPS_LABEL : place.name,
            value: place.expenseCount,
            valueLabel: countLabel(place.expenseCount, "expense"),
            href: outside ? undefined : `/groups/${place.groupId}`,
          };
        })}
      />
    </InsightCard>
  );
}
