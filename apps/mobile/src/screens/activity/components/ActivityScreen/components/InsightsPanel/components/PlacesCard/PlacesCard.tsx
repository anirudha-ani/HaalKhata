/** Places card: which groups the person's expenses happened in. */

import { useRouter } from "expo-router";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/ui/Text";
import type { GroupActivity } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList";
import {
  countLabel,
  OUTSIDE_GROUPS_EMOJI,
  OUTSIDE_GROUPS_LABEL,
} from "@haalkhata/shared/analytics/insights";
import { groupEmoji } from "@haalkhata/shared/group/groupTypes";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders the busiest places the person split in over the window: their
 * groups, plus one row for expenses outside any group. A row opens the
 * group when the person is still in it; the outside-groups row, and a group
 * they have since left, have nowhere they can be taken.
 *
 * @returns The card, or nothing when there were no expenses.
 */
export function PlacesCard({
  groups,
  style,
}: {
  /** The places, busiest first; an empty group id means outside any group. */
  groups: readonly GroupActivity[];
  /** Layout styles for the card, e.g. its share of a row. */
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  if (groups.length === 0) return null;
  return (
    <InsightCard style={style} subtitle="By number of expenses." title="Where you split">
      <BarList
        rows={groups.map((place) => {
          const outside = place.groupId === "";
          return {
            key: place.groupId || "outside",
            leading: (
              <Text style={styles.emoji}>
                {outside ? OUTSIDE_GROUPS_EMOJI : groupEmoji(place.type)}
              </Text>
            ),
            label: outside ? OUTSIDE_GROUPS_LABEL : place.name,
            value: place.expenseCount,
            valueLabel: countLabel(place.expenseCount, "expense"),
            // A group they have left is still part of their history, but
            // its screen is closed to them: opening it would show a refusal.
            onPress: place.isMember ? () => router.push(`/groups/${place.groupId}`) : undefined,
          };
        })}
      />
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  emoji: {
    fontSize: 18,
  },
});
