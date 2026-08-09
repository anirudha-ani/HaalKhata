/** Activity screen: cross-group event feed with per-type emoji and actor avatars. */

import { Bell } from "lucide-react-native";
import { ActivityList } from "@/components/activity/ActivityList";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { colors } from "@/lib/theme/theme";
import { useActivity } from "./hooks/useActivity";

/**
 * Renders the activity feed: a spinner while loading, an empty state when
 * there are no events, otherwise the shared pressable event list. Visiting
 * the screen marks notifications read.
 *
 * @returns The activity screen content.
 */
export function ActivityScreen() {
  const activity = useActivity();

  return (
    <Screen
      header={<DetailHeader title="Activity" />}
      onRefresh={activity.refresh}
      refreshing={activity.isRefreshing}
    >
      {activity.isLoading ? (
        <Spinner label="Loading activity…" />
      ) : activity.events.length === 0 ? (
        <EmptyState
          hint="Expenses, payments and group changes involving you will show up here."
          icon={<Bell color={colors.inkSoft} size={32} />}
          title="Nothing yet"
        />
      ) : (
        <ActivityList events={activity.events} />
      )}
    </Screen>
  );
}
