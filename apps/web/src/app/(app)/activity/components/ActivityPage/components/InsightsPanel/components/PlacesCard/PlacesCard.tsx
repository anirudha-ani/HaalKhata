"use client";
/** Places card: which groups the person's expenses happened in. */

import type { GroupActivity } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList/BarList";
import {
  countLabel,
  OUTSIDE_GROUPS_EMOJI,
  OUTSIDE_GROUPS_LABEL,
} from "@haalkhata/shared/analytics/insights";
import { groupEmoji } from "@haalkhata/shared/group/groupTypes";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders the busiest places the person split in over the window: their
 * groups, plus one row for expenses outside any group. A row leads to the
 * group when the person is still in it; the outside-groups row, and a group
 * they have since left, have nowhere they can be taken.
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
            // A group they have left is still part of their history, but
            // its page is closed to them: a link there would lead to a refusal.
            href: place.isMember ? `/groups/${place.groupId}` : undefined,
          };
        })}
      />
    </InsightCard>
  );
}
