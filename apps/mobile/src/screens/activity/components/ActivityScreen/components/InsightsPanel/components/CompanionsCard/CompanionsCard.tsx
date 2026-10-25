/** Companions card: the people the person shared the most expenses with. */

import { useRouter } from "expo-router";
import type { StyleProp, ViewStyle } from "react-native";
import type { Companion } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { BarList } from "@/components/charts/BarList";
import { Avatar } from "@/components/ui/Avatar";
import { countLabel } from "@haalkhata/shared/analytics/insights";
import { InsightCard } from "../InsightCard/InsightCard";

/**
 * Renders the people the person split with most over the window. Each row
 * opens the shared ledger with that person, like every other name in the
 * app.
 *
 * @returns The card, or nothing when they split with nobody.
 */
export function CompanionsCard({
  companions,
  style,
}: {
  /** The people, most shared expenses first. */
  companions: readonly Companion[];
  /** Layout styles for the card, e.g. its share of a row. */
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  if (companions.length === 0) return null;
  return (
    <InsightCard
      style={style}
      subtitle="By expenses you were both on."
      title="Who you split with"
    >
      <BarList
        rows={companions.map((companion) => ({
          key: companion.userId,
          leading: <Avatar size="sm" user={{ ...companion, id: companion.userId }} />,
          label: companion.name,
          value: companion.sharedExpenseCount,
          valueLabel: countLabel(companion.sharedExpenseCount, "expense"),
          onPress: () => router.push(`/friends/${companion.userId}`),
        }))}
      />
    </InsightCard>
  );
}
