/** Groups screen UI: group summary cards and the new-group sheet. */

import { useRouter } from "expo-router";
import { Plus, UsersRound } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PersonChecklist } from "@/components/people/PersonChecklist";
import { Screen } from "@/components/shell/Screen";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { SearchField } from "@/components/ui/SearchField";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { GROUP_BALANCE_FILTERS, noGroupsMessage } from "@haalkhata/shared/group/balanceFilter";
import { CURRENCIES } from "@haalkhata/shared/money/money.constants";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { GROUP_TYPES, groupEmoji } from "../../constants/groupTypes";
import { useGroups } from "./hooks/useGroups";
import { MAX_GROUP_NAME_LENGTH } from "@haalkhata/shared/text/limits";

/**
 * Renders the groups screen: a searchable, balance-filterable card list of
 * group summaries (member count and your net balance per group) and a
 * bottom-sheet form for creating a new group.
 *
 * @returns The groups screen content, with a spinner while the list loads.
 */
export function GroupsScreen() {
  const groupsState = useGroups();
  const router = useRouter();

  return (
    <Screen
      header={<ScreenHeader />}
      onRefresh={groupsState.refresh}
      refreshing={groupsState.isRefreshing}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Groups</Text>
        <Button
          compact
          icon={<Plus color={colors.white} size={16} />}
          label="New group"
          onPress={() => groupsState.setCreating(true)}
        />
      </View>

      {groupsState.isLoading ? (
        <Spinner label="Loading groups…" />
      ) : groupsState.groups.length === 0 ? (
        <EmptyState
          action={
            <Button
              compact
              label="Create your first group"
              onPress={() => groupsState.setCreating(true)}
            />
          }
          hint="Start a group for a trip, your flat, or anything you share costs on."
          icon={<UsersRound color={colors.inkSoft} size={32} />}
          title="No groups yet"
        />
      ) : (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <SearchField
                onChange={groupsState.setQuery}
                placeholder="Search groups by name or type"
                value={groupsState.query}
              />
            </View>
            {/* The count has to account for the balance filter too, or it
                would read as unfiltered while rows are being hidden. */}
            {groupsState.query || groupsState.balance !== "all" ? (
              <Text style={styles.searchCount}>
                {groupsState.visibleGroups.length} of {groupsState.groups.length}
              </Text>
            ) : null}
          </View>

          {/* Filter state stays visible while it hides rows, matching the
              activity feed: the active chip is styled, not just remembered. */}
          <View style={styles.filterChips}>
            {GROUP_BALANCE_FILTERS.map((entry) => (
              <Chip
                key={entry.value}
                label={entry.label}
                onPress={() => groupsState.setBalance(entry.value)}
                selected={groupsState.balance === entry.value}
              />
            ))}
          </View>

          {groupsState.visibleGroups.length === 0 ? (
            <View style={styles.noMatchCard}>
              <Text style={styles.noMatchText}>
                {noGroupsMessage(groupsState.query, groupsState.balance)}
              </Text>
            </View>
          ) : (
        <View style={styles.cards}>
          {groupsState.visibleGroups.map((summary) =>
            summary.group ? (
              <Pressable
                key={summary.group.id}
                onPress={() => router.push(`/groups/${summary.group?.id}`)}
                style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardEmoji}>{groupEmoji(summary.group.type)}</Text>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{summary.group.type}</Text>
                  </View>
                </View>
                <View>
                  <Text style={styles.cardName}>{summary.group.name}</Text>
                  <Text style={styles.cardMembers}>
                    {summary.memberCount} member{summary.memberCount === 1 ? "" : "s"}
                  </Text>
                </View>
                {summary.yourNetCents === 0 ? (
                  <Text style={styles.cardSettled}>all settled up</Text>
                ) : (
                  <View style={styles.cardBalance}>
                    <Text style={styles.cardBalanceLabel}>
                      {summary.yourNetCents > 0 ? "you are owed " : "you owe "}
                    </Text>
                    <Money
                      cents={summary.yourNetCents}
                      currency={summary.group.currency}
                      signed
                      style={styles.cardBalanceAmount}
                    />
                  </View>
                )}
              </Pressable>
            ) : null,
          )}
        </View>
          )}
        </>
      )}

      {groupsState.creating ? (
        <Sheet onClose={() => groupsState.setCreating(false)} title="New group">
          <View style={styles.form}>
            <TextField
              autoFocus
              maxLength={MAX_GROUP_NAME_LENGTH}
              onChangeText={groupsState.setName}
              placeholder="Group name (e.g. Sundarban Trip)"
              value={groupsState.name}
            />
            <View style={styles.typeGrid}>
              {GROUP_TYPES.map((groupType) => {
                const selected = groupsState.type === groupType.value;
                return (
                  <Pressable
                    key={groupType.value}
                    onPress={() => groupsState.setType(groupType.value)}
                    style={[styles.typeOption, selected ? styles.typeOptionSelected : null]}
                  >
                    <Text style={styles.typeOptionEmoji}>{groupType.emoji}</Text>
                    <Text
                      style={[
                        styles.typeOptionLabel,
                        selected ? styles.typeOptionLabelSelected : null,
                      ]}
                    >
                      {groupType.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.currencyBlock}>
              <Text style={styles.currencyLabel}>Currency</Text>
              <View style={styles.currencyChips}>
                {CURRENCIES.map((currencyCode) => (
                  <Chip
                    key={currencyCode}
                    label={currencyCode}
                    onPress={() => groupsState.setCurrency(currencyCode)}
                    selected={groupsState.currency === currencyCode}
                  />
                ))}
              </View>
            </View>
            {/* Members at creation, so a new group is not born empty and then
                needing a second trip through a separate add-people sheet. */}
            {groupsState.friends.length > 0 ? (
              <View style={styles.memberBlock}>
                <Text style={styles.memberLabel}>
                  Who&apos;s in?{" "}
                  <Text style={styles.memberHint}>
                    {groupsState.memberIds.length > 0
                      ? `${groupsState.memberIds.length} selected`
                      : "optional — you can add people later"}
                  </Text>
                </Text>
                <PersonChecklist
                  onToggle={groupsState.toggleMember}
                  people={groupsState.friends}
                  selectedIds={groupsState.memberIds}
                />
              </View>
            ) : null}
            {groupsState.error ? <Text style={styles.error}>{groupsState.error}</Text> : null}
            <Button
              busy={groupsState.isCreating}
              disabled={groupsState.name.trim() === ""}
              label="Create group"
              onPress={groupsState.submitCreate}
            />
          </View>
        </Sheet>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardBalance: {
    alignItems: "center",
    flexDirection: "row",
  },
  cardBalanceAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  cardBalanceLabel: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  cardEmoji: {
    fontSize: 30,
  },
  cardMembers: {
    color: colors.inkSoft,
    fontSize: 13,
    marginTop: 2,
  },
  cardName: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "600",
  },
  cardPressed: {
    borderColor: colors.brand200,
  },
  cards: {
    gap: spacing.md,
  },
  cardSettled: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  cardTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  currencyBlock: {
    gap: spacing.sm,
  },
  currencyChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  currencyLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
  },
  filterChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  form: {
    gap: spacing.lg,
  },
  memberBlock: {
    gap: spacing.sm,
  },
  memberHint: {
    color: colors.inkSoft,
    fontWeight: "400",
  },
  memberLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
  },
  noMatchCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  noMatchText: {
    color: colors.inkSoft,
    fontSize: 14,
    textAlign: "center",
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
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  typeBadge: {
    backgroundColor: colors.paper,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.xs,
  },
  typeBadgeText: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  typeGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  typeOption: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  typeOptionEmoji: {
    fontSize: 22,
  },
  typeOptionLabel: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "500",
  },
  typeOptionLabelSelected: {
    color: colors.brand700,
  },
  typeOptionSelected: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand600,
  },
});
