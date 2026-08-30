/** Activity screen: searchable, filterable, day-grouped feed with keyset pagination. */

import { Bell, ChevronDown } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ActivityList } from "@/components/activity/ActivityList";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchField } from "@/components/ui/SearchField";
import { Spinner } from "@/components/ui/Spinner";
import { ACTIVITY_FILTERS } from "@haalkhata/shared/activity/filters";
import { monthLabel } from "@haalkhata/shared/activity/format";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { useActivity } from "./hooks/useActivity";

/**
 * Renders the activity feed: search, type filters, a month window, and the
 * events grouped by day with a Show me more button. Visiting the screen
 * marks notifications read.
 *
 * Load more rather than infinite scroll: an audit trail is task-driven
 * reading, where an explicit control beats content that appears on its own.
 *
 * @returns The activity screen content.
 */
export function ActivityScreen() {
  const activity = useActivity();
  const isFiltered =
    activity.query !== "" || activity.filter !== "all" || activity.month !== "";

  return (
    <Screen
      header={<DetailHeader title="Activity" />}
      onRefresh={activity.refresh}
      refreshing={activity.isRefreshing}
    >
      {activity.isLoading ? (
        <Spinner label="Loading activity…" />
      ) : activity.events.length === 0 && !isFiltered ? (
        <EmptyState
          hint="Expenses, payments and group changes involving you will show up here."
          icon={<Bell color={colors.inkSoft} size={32} />}
          title="Nothing yet"
        />
      ) : (
        <>
          <SearchField
            onChange={activity.setQuery}
            placeholder="Search activity"
            value={activity.query}
          />

          {/* Filter state has to stay visible while it hides rows, so the
              active chip is styled, not just remembered. */}
          <View style={styles.filterRow}>
            <View style={styles.chips}>
              {ACTIVITY_FILTERS.map((entry) => (
                <Chip
                  key={entry.value}
                  label={entry.label}
                  onPress={() => activity.setFilter(entry.value)}
                  selected={activity.filter === entry.value}
                />
              ))}
            </View>
            {activity.visibleEvents.length !== activity.events.length ? (
              <Text style={styles.count}>
                {activity.visibleEvents.length} of {activity.events.length} loaded
              </Text>
            ) : null}
          </View>

          {/* The month window: only months that actually hold activity are
              offered, so nothing here leads to an empty screen. */}
          {activity.months.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.months}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <Chip
                label="All time"
                onPress={() => activity.setMonth("")}
                selected={activity.month === ""}
              />
              {activity.months.map((monthKey) => (
                <Chip
                  key={monthKey}
                  label={monthLabel(monthKey)}
                  onPress={() => activity.setMonth(monthKey)}
                  selected={activity.month === monthKey}
                />
              ))}
            </ScrollView>
          ) : null}

          {activity.visibleEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Crickets. Nothing matches that.</Text>
            </View>
          ) : (
            <ActivityList events={activity.visibleEvents} now={new Date()} />
          )}

          {activity.hasMore ? (
            <Button
              busy={activity.isLoadingMore}
              icon={<ChevronDown color={colors.inkSoft} size={16} />}
              label="Show me more"
              onPress={activity.loadMore}
              variant="outline"
            />
          ) : activity.events.length > 0 ? (
            <Text style={styles.bottom}>
              You&apos;ve hit the bottom{activity.month ? ` of ${monthLabel(activity.month)}` : ""}.
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bottom: {
    color: colors.inkSoft,
    fontSize: 12,
    textAlign: "center",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  count: {
    color: colors.inkSoft,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.inkSoft,
    fontSize: 14,
    textAlign: "center",
  },
  filterRow: {
    gap: spacing.sm,
  },
  months: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
