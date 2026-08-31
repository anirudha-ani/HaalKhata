/** All-expenses screen UI: every expense you're on, searchable, filtered by scope. */

import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { useResponsiveLayout } from "@/components/shell/hooks/useResponsiveLayout";
import { Screen } from "@/components/shell/Screen";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import { Spinner } from "@/components/ui/Spinner";
import { noExpensesMessage } from "@haalkhata/shared/expense/scopeFilter";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { useExpensesList } from "./hooks/useExpensesList";

/**
 * Renders the all-expenses screen: one list of every expense the user pays
 * for or owes on, group and one-off alike, searchable and narrowable by
 * scope.
 *
 * This screen exists because one-off expenses had no home of their own: they
 * were reachable only through the friend they were shared with, so "what
 * one-off expenses do I have?" had no answer. The One-off chip is that
 * answer; the group chips come along for free from the same filter.
 *
 * @returns The expenses screen content, with a spinner while the list loads.
 */
export function ExpensesScreen() {
  const listState = useExpensesList();
  const router = useRouter();
  const { isExpanded } = useResponsiveLayout();

  const scopeChips = [
    { value: "all", label: "All" },
    { value: "oneoff", label: "One-off" },
    ...listState.groups.flatMap((summary) =>
      summary.group ? [{ value: summary.group.id, label: summary.group.name }] : [],
    ),
  ];
  const filteredGroupName = listState.groupNameById.get(listState.scope) ?? "";
  const isFiltered = listState.query !== "" || listState.scope !== "all";

  return (
    <Screen
      header={<ScreenHeader />}
      onRefresh={listState.refresh}
      refreshing={listState.isRefreshing}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Expenses</Text>
        <Button
          compact
          icon={<Plus color={colors.white} size={16} />}
          label="Add expense"
          onPress={() => router.push("/expenses/new")}
        />
      </View>

      {listState.isLoading ? (
        <Spinner label="Loading expenses…" />
      ) : (
        <View style={[styles.workspace, isExpanded ? styles.workspaceExpanded : null]}>
          <View style={[styles.filters, isExpanded ? styles.filtersExpanded : null]}>
            <View style={styles.searchRow}>
              <View style={styles.searchField}>
                <SearchField
                  onChange={listState.setQuery}
                  placeholder="Search by description, category, or group"
                  value={listState.query}
                />
              </View>
              {/* The count accounts for every active control, or it would read
                  as unfiltered while rows are being hidden. */}
              {isFiltered ? (
                <Text style={styles.searchCount}>
                  {listState.visibleExpenses.length} of {listState.expenses.length}
                </Text>
              ) : null}
            </View>

            <View style={styles.chips}>
              {scopeChips.map((chip) => (
                <Chip
                  key={chip.value}
                  label={chip.label}
                  onPress={() => listState.setScope(chip.value)}
                  selected={listState.scope === chip.value}
                />
              ))}
            </View>

            {/* The list is bounded; the balances are not. Say so rather than
                let an old row's absence read as its deletion. */}
            {listState.truncated ? (
              <Text style={styles.truncated}>
                Showing your most recent expenses — older ones still count toward every balance.
              </Text>
            ) : null}
          </View>

          <View style={[styles.results, isExpanded ? styles.resultsExpanded : null]}>
            {listState.visibleExpenses.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {noExpensesMessage(listState.query, listState.scope, filteredGroupName)}
                </Text>
              </View>
            ) : (
              <ExpenseList
                emptyHint=""
                expenses={listState.visibleExpenses}
                groupNameById={listState.groupNameById}
                meId={listState.me?.id}
                settledIds={listState.settledIds}
                userById={listState.userById}
              />
            )}
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
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
  filters: {
    gap: spacing.xl,
  },
  filtersExpanded: {
    flex: 2,
    minWidth: 0,
  },
  results: {
    minWidth: 0,
  },
  resultsExpanded: {
    flex: 3,
  },
  searchCount: {
    color: colors.inkSoft,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  searchField: {
    flex: 1,
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "700",
  },
  truncated: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
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
