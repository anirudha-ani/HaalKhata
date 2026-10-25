/** Feed footer: the Show me more button, why the last page did not load, or the bottom of the history. */

import { ChevronDown } from "lucide-react-native";
import { StyleSheet } from "react-native";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { monthLabel } from "@haalkhata/shared/activity/format";
import { colors } from "@/lib/theme/theme";
import type { useActivity } from "../../../../hooks/useActivity";

/**
 * Renders what sits under the rows. A failed next page is said just above
 * Show me more, which is the way to ask for it again, and the rows already
 * loaded stay where they are; once there is nothing further, a line says
 * the bottom was reached.
 *
 * @param props - The feed's data and controls, from the screen's `useActivity`.
 * @returns The footer, or nothing for a feed with no rows and no more to load.
 */
export function FeedFooter({ activity }: { activity: ReturnType<typeof useActivity> }) {
  if (!activity.hasMore) {
    return activity.events.length > 0 ? (
      <Text style={styles.bottom}>
        You&apos;ve hit the bottom{activity.month ? ` of ${monthLabel(activity.month)}` : ""}.
      </Text>
    ) : null;
  }

  return (
    <>
      {activity.loadMoreFailed ? (
        <ErrorAlert message={`Couldn't load more: ${activity.loadError}`} />
      ) : null}
      <Button
        busy={activity.isLoadingMore}
        icon={<ChevronDown color={colors.inkSoft} size={16} />}
        label="Show me more"
        onPress={activity.loadMore}
        variant="outline"
      />
    </>
  );
}

const styles = StyleSheet.create({
  bottom: {
    color: colors.inkSoft,
    fontSize: 12,
    textAlign: "center",
  },
});
