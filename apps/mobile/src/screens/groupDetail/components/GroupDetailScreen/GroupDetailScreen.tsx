/** Group detail orchestrator: header, members strip, expenses/balances/activity tabs, add-people and settle sheets. */

import { useRouter } from "expo-router";
import { Bell, Plus, ScanLine, UserPlus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActivityList } from "@/components/activity/ActivityList";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { PersonChecklist } from "@/components/people/PersonChecklist";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { errorMessage } from "@/lib/api/connect";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { groupEmoji } from "../../../groups/constants/groupTypes";
import { TABS } from "../../constants/tabs";
import { BalancesPanel } from "./components/BalancesPanel/BalancesPanel";
import { ExpenseList } from "./components/ExpenseList/ExpenseList";
import { useGroupDetail } from "./hooks/useGroupDetail";

/**
 * Renders a single group's screen: header with scan/add-expense actions, the
 * member avatar strip with an add-people button, the expenses/balances tab
 * switcher, and the add-people and settle-up sheets.
 *
 * @returns The group detail content, a spinner while loading, or a not-found
 *   message when the group cannot be fetched.
 */
export function GroupDetailScreen({
  groupId,
}: {
  /** Identifier of the group to display, taken from the route params. */
  groupId: string;
}) {
  const groupDetail = useGroupDetail(groupId);
  const router = useRouter();

  if (groupDetail.isLoading) {
    return (
      <Screen header={<DetailHeader title="Group" />}>
        <Spinner label="Loading group…" />
      </Screen>
    );
  }
  if (!groupDetail.group) {
    return (
      <Screen header={<DetailHeader title="Group" />}>
        <View style={styles.notFoundCard}>
          <Text style={styles.notFoundText}>
            {groupDetail.groupError ? errorMessage(groupDetail.groupError) : "Group not found."}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      header={
        <DetailHeader
          right={
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel="Scan receipt"
                hitSlop={8}
                onPress={() => router.push(`/scan?group=${groupId}`)}
                style={styles.headerIconButton}
              >
                <ScanLine color={colors.brand600} size={20} />
              </Pressable>
              <Pressable
                accessibilityLabel="Add expense"
                hitSlop={8}
                onPress={() => router.push(`/expenses/new?group=${groupId}`)}
                style={[styles.headerIconButton, styles.headerIconButtonPrimary]}
              >
                <Plus color={colors.white} size={20} />
              </Pressable>
            </View>
          }
          title={groupDetail.group.name}
        />
      }
      onRefresh={groupDetail.refresh}
      refreshing={groupDetail.isRefreshing}
    >
      <View style={styles.groupHeader}>
        <View style={styles.groupEmojiTile}>
          <Text style={styles.groupEmoji}>{groupEmoji(groupDetail.group.type)}</Text>
        </View>
        <View>
          <Text style={styles.groupName}>{groupDetail.group.name}</Text>
          <Text style={styles.groupMeta}>
            {groupDetail.group.type} · {groupDetail.group.currency}
          </Text>
        </View>
      </View>

      {/* Members strip */}
      <View style={styles.membersCard}>
        <View style={styles.memberAvatars}>
          {(groupDetail.group.members ?? []).map((member, index) =>
            member.user ? (
              <View key={member.user.id} style={index > 0 ? styles.memberOverlap : null}>
                <Avatar ring size="sm" user={member.user} />
              </View>
            ) : null,
          )}
        </View>
        <Text numberOfLines={1} style={styles.memberNames}>
          {(groupDetail.group.members ?? [])
            .flatMap((member) =>
              member.user
                ? [member.user.id === groupDetail.me?.id ? "You" : member.user.name.split(" ")[0]]
                : [],
            )
            .join(", ")}
        </Text>
        <Button
          compact
          icon={<UserPlus color={colors.inkSoft} size={14} />}
          label="Add people"
          onPress={() => groupDetail.setAddingPeople(true)}
          variant="outline"
        />
      </View>

      {/* Tabs */}
      <Segmented onChange={groupDetail.setTab} options={TABS} value={groupDetail.tab} />

      {groupDetail.tab === "expenses" ? (
        <ExpenseList
          emptyHint="Add the first expense or scan a receipt to get this ledger going."
          expenses={groupDetail.expenses?.expenses ?? []}
          meId={groupDetail.me?.id}
          userById={groupDetail.userById}
        />
      ) : groupDetail.tab === "balances" ? (
        <BalancesPanel
          balances={groupDetail.balances}
          currency={groupDetail.group.currency}
          meId={groupDetail.me?.id}
          onSettle={(user, cents) => groupDetail.setSettleWith({ user, cents })}
          onToggleSimplified={groupDetail.setSimplified}
          simplified={groupDetail.simplified}
          simplifyPending={groupDetail.simplifyPending}
          userById={groupDetail.userById}
        />
      ) : groupDetail.activityLoading ? (
        <Spinner label="Loading activity…" />
      ) : groupDetail.activityEvents.length === 0 ? (
        <EmptyState
          hint="Expenses, payments and people joining this group will show up here."
          icon={<Bell color={colors.inkSoft} size={32} />}
          title="Nothing yet"
        />
      ) : (
        <ActivityList events={groupDetail.activityEvents} />
      )}

      {groupDetail.addingPeople ? (
        <Sheet
          onClose={() => groupDetail.setAddingPeople(false)}
          title={`Add people to ${groupDetail.group.name}`}
        >
          {/* People you already know come first; typing an address is the
              fallback for the one person who is new. */}
          <View style={styles.addForm}>
            {groupDetail.candidates.length > 0 ? (
              <>
                <Text style={styles.addLabel}>
                  Your people
                  {groupDetail.pickedIds.length > 0
                    ? ` · ${groupDetail.pickedIds.length} selected`
                    : ""}
                </Text>
                <PersonChecklist
                  onToggle={groupDetail.togglePicked}
                  people={groupDetail.candidates}
                  selectedIds={groupDetail.pickedIds}
                />
              </>
            ) : (
              <Text style={styles.addHint}>
                Everyone on your friends list is already here. Add somebody new below.
              </Text>
            )}

            <TextField
              autoCapitalize="none"
              keyboardType="email-address"
              label="Not on the list?"
              onChangeText={groupDetail.setIdentifier}
              placeholder="Email or phone number"
              value={groupDetail.identifier}
            />
            <Text style={styles.addHint}>
              If they don&apos;t have an account yet, their share is tracked and waiting when they
              sign up.
            </Text>

            {groupDetail.peopleError ? (
              <Text style={styles.addError}>{groupDetail.peopleError}</Text>
            ) : null}
            <Button
              busy={groupDetail.addMembers.isPending}
              disabled={!groupDetail.canAddPeople}
              label="Add to group"
              onPress={groupDetail.submitPeople}
            />
          </View>
        </Sheet>
      ) : null}

      {groupDetail.settleWith ? (
        <SettleUpModal
          currency={groupDetail.group.currency}
          groupId={groupId}
          onClose={() => groupDetail.setSettleWith(null)}
          suggestedCents={groupDetail.settleWith.cents}
          to={groupDetail.settleWith.user}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addError: {
    color: colors.brand600,
    fontSize: 14,
  },
  addForm: {
    gap: spacing.lg,
  },
  addHint: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -spacing.sm,
  },
  addLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: -spacing.sm,
  },
  groupEmoji: {
    fontSize: 28,
  },
  groupEmojiTile: {
    alignItems: "center",
    backgroundColor: colors.brand50,
    borderRadius: radii.lg,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  groupHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
  },
  groupMeta: {
    color: colors.inkSoft,
    fontSize: 13,
    marginTop: 2,
    textTransform: "capitalize",
  },
  groupName: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  headerIconButton: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  headerIconButtonPrimary: {
    backgroundColor: colors.brand600,
    borderColor: colors.brand600,
  },
  memberAvatars: {
    flexDirection: "row",
  },
  memberNames: {
    color: colors.inkSoft,
    flex: 1,
    fontSize: 13,
  },
  memberOverlap: {
    marginLeft: -8,
  },
  membersCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  notFoundCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  notFoundText: {
    color: colors.inkSoft,
    fontSize: 15,
  },
});
