/** Activity feed: searchable, filterable, day-grouped events with keyset pagination. */

import { Bell } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { ActivityList } from "@/components/activity/ActivityList";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { SearchField } from "@/components/ui/SearchField";
import { ACTIVITY_FILTERS } from "@haalkhata/shared/activity/filters";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { useActivity } from "../../hooks/useActivity";
import { FeedFooter } from "./components/FeedFooter/FeedFooter";
import { MonthPicker } from "./components/MonthPicker/MonthPicker";

/**
 * Renders the activity feed: search, type filters, a month window, and the
 * events grouped by day with a Show me more button.
 *
 * Load more rather than infinite scroll: an audit trail is task-driven
 * reading, where an explicit control beats content that appears on its own.
 *
 * The feed's state lives in the screen's `useActivity`, not here, so
 * switching to the insights view and back keeps the search, the filters and
 * every page already loaded.
 *
 * A failed read is said where its rows would be: in place of the whole
 * feed when nothing has loaded, above the rows when a reload failed, and
 * just above Show me more when the next page did. The rows already loaded
 * stay on screen in the last two cases, so a failure costs nobody their
 * place in a long history.
 *
 * @returns The feed.
 */
export function ActivityFeed({
  activity,
}: {
  /** The feed's data and controls, from the screen's `useActivity`. */
  activity: ReturnType<typeof useActivity>;
}) {
  const { isExpanded } = useResponsiveLayout();
  const isFiltered =
    activity.query !== "" || activity.filter !== "all" || activity.month !== "";

  if (activity.events.length === 0 && !isFiltered) {
    return activity.loadError ? (
      <ErrorAlert
        message={`Couldn't load your activity: ${activity.loadError}`}
        onRetry={activity.retry}
      />
    ) : (
      <EmptyState
        hint="Expenses, payments and group changes involving you will show up here."
        icon={<Bell color={colors.inkSoft} size={32} />}
        title="Nothing yet"
      />
    );
  }

  return (
    <View style={[styles.workspace, isExpanded ? styles.workspaceExpanded : null]}>
      <View style={[styles.filters, isExpanded ? styles.filtersExpanded : null]}>
        {/* The month window: only months that actually hold activity are
            offered, so nothing here leads to an empty screen. */}
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <SearchField
              onChange={activity.setQuery}
              placeholder="Search activity"
              value={activity.query}
            />
          </View>
          {activity.months.length > 0 ? (
            <MonthPicker month={activity.month} months={activity.months} onChange={activity.setMonth} />
          ) : null}
        </View>

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
      </View>

      <View style={[styles.results, isExpanded ? styles.resultsExpanded : null]}>
        {activity.loadError && !activity.loadMoreFailed ? (
          <ErrorAlert
            message={`Couldn't load your activity: ${activity.loadError}`}
            onRetry={activity.retry}
          />
        ) : null}

        {activity.visibleEvents.length > 0 ? (
          <ActivityList events={activity.visibleEvents} now={new Date()} />
        ) : activity.loadError ? null : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Crickets. Nothing matches that.</Text>
          </View>
        )}

        <FeedFooter activity={activity} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  filters: {
    gap: spacing.xl,
  },
  filtersExpanded: {
    flex: 2,
    minWidth: 0,
  },
  results: {
    gap: spacing.xl,
    minWidth: 0,
  },
  resultsExpanded: {
    flex: 3,
  },
  search: {
    flex: 1,
    minWidth: 0,
  },
  searchRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  workspace: {
    gap: spacing.xl,
  },
  workspaceExpanded: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.xxl,
  },
});
