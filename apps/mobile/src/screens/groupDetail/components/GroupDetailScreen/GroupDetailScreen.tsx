/** Group detail orchestrator: header, members strip, expenses/balances/activity tabs, members, add-people and settle sheets. */

import { useRouter } from "expo-router";
import { Bell, ChevronDown, ChevronRight, Link2, Plus, Send, UserPlus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActivityList } from "@/components/activity/ActivityList";
import { InviteShareSheet } from "@/components/modals/InviteShareSheet";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { PersonChecklist } from "@/components/people/PersonChecklist";
import { PersonLink } from "@/components/people/PersonLink";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { useResponsiveLayout } from "@/components/shell/hooks/useResponsiveLayout";
import { Screen } from "@/components/shell/Screen";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmailOrPhoneField } from "@/components/ui/EmailOrPhoneField";
import { EmptyState } from "@/components/ui/EmptyState";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { OWNER_ROLE } from "@haalkhata/shared/group/roles";
import { groupEmoji } from "../../../groups/constants/groupTypes";
import { TABS } from "../../constants/tabs";
import { BalancesPanel } from "./components/BalancesPanel/BalancesPanel";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { useGroupDetail } from "./hooks/useGroupDetail";

/**
 * Renders a single group's screen: header with the add-expense action, the
 * member avatar strip (tap for the full member list, where every row opens
 * that person's ledger or offers a friend request, you can leave the group,
 * and the owner can hand it on or remove somebody) with an add-people
 * button, the
 * expenses/balances tab switcher, and the members, add-people and settle-up
 * sheets.
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
  const { isExpanded } = useResponsiveLayout();

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

  const members = groupDetail.group.members ?? [];
  const viewerIsOwner = members.some(
    (member) => member.user?.id === groupDetail.me?.id && member.role === OWNER_ROLE,
  );

  return (
    <Screen
      header={
        <DetailHeader
          right={
            // One button, not two: scanning a receipt is how you fill the
            // expense form in, so "Scan receipt" was a second door to the
            // same room.
            <Pressable
              accessibilityLabel="Add expense"
              hitSlop={8}
              onPress={() => router.push(`/expenses/new?group=${groupId}`)}
              style={[styles.headerIconButton, styles.headerIconButtonPrimary]}
            >
              <Plus color={colors.white} size={20} />
            </Pressable>
          }
          title={groupDetail.group.name}
        />
      }
      onRefresh={groupDetail.refresh}
      refreshing={groupDetail.isRefreshing}
    >
      <View style={[styles.overview, isExpanded ? styles.overviewExpanded : null]}>
        <View style={[styles.groupHeader, isExpanded ? styles.groupHeaderExpanded : null]}>
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

        {/* Members strip. The avatars-and-names run opens the full member
            list — a truncated line of first names is a summary, not a way to
            reach anyone, and it is where leaving the group lives. */}
        <View style={[styles.membersCard, isExpanded ? styles.membersCardExpanded : null]}>
          <Pressable
            accessibilityLabel="View members"
            accessibilityRole="button"
            onPress={() => groupDetail.setViewingMembers(true)}
            style={styles.membersSummary}
          >
            <View style={styles.memberAvatars}>
              {members.map((member, index) =>
                member.user ? (
                  <View key={member.user.id} style={index > 0 ? styles.memberOverlap : null}>
                    <Avatar ring size="sm" user={member.user} />
                  </View>
                ) : null,
              )}
            </View>
            <Text numberOfLines={1} style={styles.memberNames}>
              {members
                .flatMap((member) =>
                  member.user
                    ? [member.user.id === groupDetail.me?.id ? "You" : member.user.name.split(" ")[0]]
                    : [],
                )
                .join(", ")}
            </Text>
          </Pressable>
          <Button
            compact
            icon={<UserPlus color={colors.inkSoft} size={14} />}
            label="Add people"
            onPress={() => groupDetail.setAddingPeople(true)}
            variant="outline"
          />
          <Button
            busy={groupDetail.sharingInviteLink}
            compact
            icon={<Link2 color={colors.inkSoft} size={14} />}
            label="Invite link"
            onPress={groupDetail.shareInviteLink}
            variant="outline"
          />
        </View>
        {groupDetail.linkNotice ? (
          <Text style={styles.linkNotice}>{groupDetail.linkNotice}</Text>
        ) : null}
      </View>

      {/* Tabs */}
      <Segmented onChange={groupDetail.setTab} options={TABS} value={groupDetail.tab} />

      {groupDetail.tab === "expenses" ? (
        <ExpenseList
          emptyHint="Add the first expense or scan a receipt to get this ledger going."
          expenses={groupDetail.expenses?.expenses ?? []}
          meId={groupDetail.me?.id}
          settledIds={new Set(groupDetail.expenses?.settledExpenseIds ?? [])}
          userById={groupDetail.userById}
        />
      ) : groupDetail.tab === "balances" ? (
        <BalancesPanel
          balances={groupDetail.balances}
          currency={groupDetail.group.currency}
          meId={groupDetail.me?.id}
          onSettle={(user, cents, received) =>
            groupDetail.setSettleWith({ user, cents, received })
          }
          onToggleSimplified={groupDetail.setSimplified}
          simplified={groupDetail.simplified}
          simplifyPending={groupDetail.simplifyPending}
          userById={groupDetail.userById}
        />
      ) : groupDetail.activityLoading ? (
        <Spinner label="Loading activity…" />
      ) : groupDetail.activityEvents.length === 0 ? (
        <EmptyState
          hint="Your expenses and payments in this group, and people joining it, will show up here."
          icon={<Bell color={colors.inkSoft} size={32} />}
          title="Nothing yet"
        />
      ) : (
        <>
          <ActivityList events={groupDetail.activityEvents} now={new Date()} />
          {groupDetail.activityHasMore ? (
            <Button
              busy={groupDetail.activityLoadingMore}
              icon={<ChevronDown color={colors.inkSoft} size={16} />}
              label="Show me more"
              onPress={groupDetail.loadMoreActivity}
              variant="outline"
            />
          ) : null}
        </>
      )}

      {groupDetail.viewingMembers ? (
        <Sheet
          onClose={() => groupDetail.setViewingMembers(false)}
          title={`Members (${members.length})`}
        >
          {/* Per row: you get "Leave group" unless you own the group; a
              friend's row opens your shared ledger; somebody not yet a
              friend gets a request button (they must accept before a
              friendship exists) and still opens the ledger, which works for
              any pair with group history; and as the owner, "Make owner"
              and "Remove" on everyone else.

              Leaving and removing are one RPC under one rule: the server
              refuses while that person still has a balance here, and its
              message is the honest one to show. Leaving is what makes
              membership consensual — any member may enrol you, so you must
              be able to walk out again. Handing the group on is what lets
              the owner do the same: they become an ordinary member and get
              "Leave group" like everyone else. */}
          <View style={styles.membersList}>
            {members.map((member, index) => {
              const person = member.user;
              if (!person) return null;
              const isMe = person.id === groupDetail.me?.id;
              const isOwner = member.role === OWNER_ROLE;
              const isFriend = groupDetail.friendIds.has(person.id);
              const requested = groupDetail.requestedIds.includes(person.id);
              const requesting = groupDetail.requestingUserId === person.id;
              const removing = groupDetail.removingUserId === person.id;
              const transferring = groupDetail.transferringUserId === person.id;
              return (
                <View
                  key={person.id}
                  style={[styles.memberRow, index > 0 ? styles.memberRowDivider : null]}
                >
                  <PersonLink
                    meId={groupDetail.me?.id}
                    style={styles.memberPerson}
                    userId={person.id}
                  >
                    <Avatar size="sm" user={person} />
                    <Text numberOfLines={1} style={styles.memberName}>
                      {person.name}
                      {isMe ? <Text style={styles.memberTag}> · you</Text> : null}
                      {isOwner ? <Text style={styles.memberTag}> · owner</Text> : null}
                      {!person.registered ? (
                        <Text style={styles.memberTag}> · invited</Text>
                      ) : null}
                    </Text>
                  </PersonLink>
                  {isMe ? (
                    isOwner ? null : (
                      <Button
                        busy={removing}
                        compact
                        label="Leave group"
                        onPress={() => groupDetail.removeMember(person.id)}
                        variant="outline"
                      />
                    )
                  ) : (
                    <View style={styles.memberActions}>
                      {!person.registered ? (
                        <Button
                          busy={groupDetail.remindingUserId === person.id}
                          compact
                          icon={<Send color={colors.inkSoft} size={14} />}
                          label="Remind"
                          onPress={() => groupDetail.remindMember(person)}
                          variant="outline"
                        />
                      ) : isFriend ? (
                        <Button
                          compact
                          icon={<ChevronRight color={colors.inkSoft} size={14} />}
                          label="Ledger"
                          onPress={() => {
                            groupDetail.setViewingMembers(false);
                            router.push(`/friends/${person.id}`);
                          }}
                          variant="outline"
                        />
                      ) : (
                        <Button
                          busy={requesting}
                          compact
                          disabled={requested}
                          icon={<UserPlus color={colors.white} size={14} />}
                          label={requested ? "Requested" : "Request"}
                          onPress={() => groupDetail.requestFriendship(person.id)}
                        />
                      )}
                      {viewerIsOwner ? (
                        <>
                          <Button
                            busy={transferring}
                            compact
                            label="Make owner"
                            onPress={() => groupDetail.transferOwnership(person.id)}
                            variant="outline"
                          />
                          <Button
                            busy={removing}
                            compact
                            label="Remove"
                            onPress={() => groupDetail.removeMember(person.id)}
                            variant="outline"
                          />
                        </>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })}
            {groupDetail.memberError ? (
              <Text style={styles.addError}>{groupDetail.memberError}</Text>
            ) : null}
            {viewerIsOwner ? (
              /* Revocation kills a link every member may have shared — the
                 destructive direction, so it sits with the owner. */
              <Button
                busy={groupDetail.resettingInviteLink}
                compact
                label="Turn off the group's invite link"
                onPress={groupDetail.resetInviteLink}
                variant="outline"
              />
            ) : null}
          </View>
        </Sheet>
      ) : null}

      {groupDetail.addingPeople ? (
        <Sheet
          onClose={() => groupDetail.setAddingPeople(false)}
          title={`Add people to ${groupDetail.group.name}`}
        >
          {/* People you already know come first; typing an address is the
              fallback for somebody you are connected with but who is not on
              that list. It never creates an account — the server enrols only
              people the caller already shares a friendship or a group with. */}
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
                  disabledIds={
                    new Set(
                      groupDetail.candidates
                        .filter((candidate) => !candidate.registered)
                        .map((candidate) => candidate.id),
                    )
                  }
                  disabledHint="invited — can add once they join"
                  onToggle={groupDetail.togglePicked}
                  people={groupDetail.candidates}
                  selectedIds={groupDetail.pickedIds}
                />
              </>
            ) : (
              <Text style={styles.addHint}>
                Everyone on your friends list is already here. Know somebody from another group?
                Add them below.
              </Text>
            )}

            <Text style={styles.addLabel}>Not on the list?</Text>
            <EmailOrPhoneField
              contact={groupDetail.contact}
              onContactChange={groupDetail.setContact}
              emailPlaceholder="Email address"
              emailLabel="Email of somebody already connected with you"
              phoneLabel="Phone of somebody already connected with you"
            />
            <Text style={styles.addHint}>
              Works for anyone already connected with you on HaalKhata — a friend, or someone you
              share another group with. New here? Send them a friend request from Friends first;
              once they accept, you can add them.
            </Text>

            {groupDetail.inviteOffer ? (
              <View style={styles.inviteOffer}>
                <Text style={styles.addHint}>
                  They&apos;re not on HaalKhata yet. Send them a sign-up invite?
                  Once they join, you can add them here.
                </Text>
                <Button
                  busy={groupDetail.sendingSignUpInvite}
                  compact
                  label="Send sign-up invite"
                  onPress={groupDetail.sendSignUpInvite}
                />
                <Button
                  compact
                  label="Cancel"
                  onPress={groupDetail.dismissInviteOffer}
                  variant="outline"
                />
              </View>
            ) : groupDetail.peopleError ? (
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

      {groupDetail.groupShareToken ? (
        <InviteShareSheet
          explainer={`Anyone who scans this or opens the link can join ${groupDetail.group.name}. They'll see who invited them before accepting.`}
          onClose={groupDetail.closeGroupShare}
          share={groupDetail.shareLinkToSheet}
          title="Group invite link"
          token={groupDetail.groupShareToken}
        />
      ) : null}

      {groupDetail.settleWith ? (
        <SettleUpModal
          currency={groupDetail.group.currency}
          groupId={groupId}
          onClose={() => groupDetail.setSettleWith(null)}
          received={groupDetail.settleWith.received}
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
  groupHeaderExpanded: {
    flex: 2,
    minWidth: 0,
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
  inviteOffer: {
    gap: spacing.sm,
  },
  linkNotice: {
    color: colors.pos700,
    fontSize: 13,
    fontWeight: "600",
  },
  memberActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  memberAvatars: {
    flexDirection: "row",
  },
  memberName: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  memberNames: {
    color: colors.inkSoft,
    flex: 1,
    fontSize: 13,
  },
  memberOverlap: {
    marginLeft: -8,
  },
  memberPerson: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minWidth: 0,
  },
  memberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  memberRowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
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
  membersList: {
    gap: spacing.sm,
  },
  membersCardExpanded: {
    flex: 3,
    minWidth: 0,
  },
  membersSummary: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minWidth: 0,
  },
  memberTag: {
    color: colors.inkSoft,
    fontWeight: "400",
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
  overview: {
    gap: spacing.lg,
  },
  overviewExpanded: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xxl,
  },
});
