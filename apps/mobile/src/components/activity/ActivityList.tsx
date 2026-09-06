/** Shared activity feed list: day-grouped, pressable rows with type tiles, actors, times and amounts. */

import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ActivityEvent } from "@haalkhata/protogen/social/v1/social_pb";
import { groupByDay, timeOfDay, withoutAmount } from "@haalkhata/shared/activity/format";
import { formatMoney } from "@haalkhata/shared/money/money";
import { safeActivityPath } from "@haalkhata/shared/navigation/activityPath";
import { Avatar } from "@/components/ui/Avatar";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { activityEmoji } from "./typeEmoji";

/**
 * Renders feed events grouped by day — the list itself, without the search,
 * filter or pagination chrome around it — so the global activity screen and
 * a group's activity tab draw their rows identically instead of each keeping
 * a private copy that drifts. Each row navigates to the event's link.
 *
 * @param props - Component props.
 * @returns One section per day, each a heading plus its rows.
 */
export function ActivityList({
  events,
  now,
}: {
  /** Feed events, newest first (the order the server returns them). */
  events: ActivityEvent[];
  /** The current time, for the Today/Yesterday headings. */
  now: Date;
}) {
  return (
    <View style={styles.list}>
      {groupByDay(events, now).map((group) => (
        <View key={group.heading} style={styles.day}>
          <Text style={styles.heading}>{group.heading.toUpperCase()}</Text>
          {group.events.map((event) => (
            <ActivityRow event={event} key={event.id} />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Renders one feed row: the type tile, the sentence, its context line, and
 * the amount as a right-aligned figure.
 *
 * @param props - Component props.
 * @returns The row.
 */
function ActivityRow({ event }: { event: ActivityEvent }) {
  const router = useRouter();
  const isSettlement = event.type === "settlement";
  return (
    <Pressable
      onPress={() => router.push(safeActivityPath(event.link))}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <Text style={styles.emoji}>{activityEmoji(event.type, event.inbound)}</Text>
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.message}>
          {withoutAmount(event.message, event.amountCents, event.currency)}
        </Text>
        <View style={styles.context}>
          {event.actor ? <Avatar size="sm" user={event.actor} /> : null}
          <Text style={styles.time}>{timeOfDay(event.createdAt)}</Text>
        </View>
      </View>
      {event.amountCents > 0 ? (
        <Text
          style={[
            styles.amount,
            isSettlement ? (event.inbound ? styles.amountIn : styles.amountOut) : null,
          ]}
        >
          {/* Signed only for settlements, where the direction is the point.
              An expense's amount is the whole bill, not your share, so a
              sign would claim something untrue. */}
          {isSettlement ? (event.inbound ? "+" : "−") : ""}
          {formatMoney(event.amountCents, event.currency || "USD")}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  amount: {
    color: colors.inkSoft,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  amountIn: {
    color: colors.pos700,
  },
  amountOut: {
    color: colors.ink,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  context: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs + 2,
  },
  day: {
    gap: spacing.sm,
  },
  emoji: {
    fontSize: 20,
  },
  heading: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    paddingHorizontal: spacing.xs,
  },
  list: {
    gap: spacing.lg,
  },
  message: {
    color: colors.ink,
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
  time: {
    color: colors.inkSoft,
    fontSize: 12,
  },
});
