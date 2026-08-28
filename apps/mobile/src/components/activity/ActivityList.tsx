/** Shared activity feed list: pressable rows with per-type emoji, actor avatars and dates. */

import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ActivityEvent } from "@haalkhata/protogen/social/v1/social_pb";
import { localDate } from "@haalkhata/shared/time/localTime";
import { safeActivityPath } from "@haalkhata/shared/navigation/activityPath";
import { Avatar } from "@/components/ui/Avatar";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { TYPE_EMOJI } from "./typeEmoji";

/**
 * Renders feed events as the pressable rows the activity screen draws, so a
 * group's activity tab and the global feed stay the same list instead of two
 * copies that drift. Each row navigates to the event's link when it has one.
 *
 * @param props - Component props.
 * @returns The event rows, newest first.
 */
export function ActivityList({
  events,
}: {
  /** Feed events, newest first (the order the server returns them). */
  events: ActivityEvent[];
}) {
  const router = useRouter();
  return (
    <View style={styles.list}>
      {events.map((event) => (
        <Pressable
          key={event.id}
          onPress={() => router.push(safeActivityPath(event.link))}
          style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
        >
          <Text style={styles.emoji}>{TYPE_EMOJI[event.type] ?? "📌"}</Text>
          {event.actor ? <Avatar size="sm" user={event.actor} /> : null}
          <Text numberOfLines={2} style={styles.message}>
            {event.message}
          </Text>
          <Text style={styles.date}>{localDate(event.createdAt)}</Text>
        </Pressable>
      ))}
    </View>
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
