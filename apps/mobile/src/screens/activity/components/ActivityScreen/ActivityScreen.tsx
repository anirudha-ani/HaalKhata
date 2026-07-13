/** Activity screen: cross-group event feed with per-type emoji and actor avatars. */

import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { TYPE_EMOJI } from "../../constants/typeEmoji";
import { useActivity } from "./hooks/useActivity";

/**
 * Renders the activity feed: a spinner while loading, an empty state when
 * there are no events, otherwise a pressable list of activity events with
 * per-type emoji, actor avatar, message, and date. Visiting the screen marks
 * notifications read.
 *
 * @returns The activity screen content.
 */
export function ActivityScreen() {
  const activity = useActivity();
  const router = useRouter();

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
        <View style={styles.list}>
          {activity.events.map((event) => (
            <Pressable
              key={event.id}
              onPress={() => (event.link ? router.push(event.link as never) : undefined)}
              style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
            >
              <Text style={styles.emoji}>{TYPE_EMOJI[event.type] ?? "📌"}</Text>
              {event.actor ? <Avatar size="sm" user={event.actor} /> : null}
              <Text numberOfLines={2} style={styles.message}>
                {event.message}
              </Text>
              <Text style={styles.date}>{event.createdAt.slice(0, 10)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  date: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  emoji: {
    fontSize: 20,
  },
  list: {
    gap: spacing.sm,
  },
  message: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    borderColor: colors.brand200,
  },
});
