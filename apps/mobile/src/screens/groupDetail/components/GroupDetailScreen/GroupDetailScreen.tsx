/** Group detail orchestrator: header with its options menu, members strip, expenses/balances/activity tabs, members, add-people, report and settle sheets. */

import { ErrorState } from "@/components/ui/ErrorState";
import { SafetyActions } from "@/components/safety/SafetyActions";
import { useRouter } from "expo-router";
import {
  Archive,
  ArchiveRestore,
  Bell,
  ChevronRight,
  Flag,
  Link2,
  Plus,
  UserPlus,
} from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { ActivityList } from "@/components/activity/ActivityList";
import { InviteShareSheet } from "@/components/modals/InviteShareSheet";
import { NOT_ON_HAALKHATA_COPY } from "@haalkhata/shared/invite/inviteCopy";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { SafetyDialog } from "@/components/safety/SafetyDialog/SafetyDialog";
import { PersonChecklist } from "@/components/people/PersonChecklist";
import { PersonLink } from "@/components/people/PersonLink";
import { DetailHeader } from "@/components/shell/DetailHeader/DetailHeader";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import Animated from "react-native-reanimated";
import { NOTICE_FADE_IN } from "@/lib/motion/entrances";
import { Screen } from "@/components/shell/Screen/Screen";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarStack } from "@/components/ui/AvatarStack/AvatarStack";
import { Button } from "@/components/ui/Button";
import { EmailOrPhoneField } from "@/components/ui/EmailOrPhoneField";
import { EmptyState } from "@/components/ui/EmptyState";
import { OverflowMenu } from "@/components/ui/OverflowMenu/OverflowMenu";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { ShowMoreFooter } from "@/components/ui/ShowMoreFooter/ShowMoreFooter";
import { LIST_END_LINE } from "@haalkhata/shared/api/paging";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { memberActionPrompt, memberRemovalBlock } from "@haalkhata/shared/group/memberActions";
import { memberBuckets } from "@haalkhata/shared/group/currencyBalances";
import { OWNER_ROLE } from "@haalkhata/shared/group/roles";
import {
  ARCHIVED_GROUP_HINT,
  GROUP_ARCHIVE_ACTIONS,
} from "@haalkhata/shared/group/archiving";
import { GROUP_MENU_COPY } from "@haalkhata/shared/group/groupMenu";
import { GroupStatus } from "@haalkhata/shared/group/status";
import { groupEmoji, groupTypeLabel } from "@haalkhata/shared/group/groupTypes";
import { MEMBERS_STRIP_AVATAR_SLOTS } from "../../constants/membersStrip";
import { TABS } from "../../constants/tabs";
import { BalancesPanel } from "./components/BalancesPanel/BalancesPanel";
import { ArchiveGroupSheet } from "./components/ArchiveGroupSheet/ArchiveGroupSheet";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { useGroupDetail } from "./hooks/useGroupDetail";

/**
 * Renders a single group's screen: the header naming the group (emoji, name,
 * type and currency) with the options menu (archive, report), the
 * add-expense button, the member avatar strip (tap for the
 * full member list, where every row opens that person's ledger or offers a
 * friend request, you can leave the group, and the owner can hand it on or
 * remove somebody) with the add-people and invite-link buttons, the
 * expenses/balances/activity tab switcher, and the members, add-people,
 * report and settle-up sheets.
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
  const { isExpanded, isLargeText } = useResponsiveLayout();

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
          {groupDetail.groupError ? <ErrorState error={groupDetail.groupError} retry={groupDetail.refresh} /> : null}
          <Text style={styles.notFoundText}>
            {groupDetail.groupError ? errorMessage(groupDetail.groupError) : "Group not found."}
          </Text>
        </View>
      </Screen>
    );
  }

  const members = groupDetail.group.members ?? [];
  const people = members.flatMap((member) => (member.user ? [member.user] : []));
  const archived = groupDetail.group.status === GroupStatus.ARCHIVED;
  // The strip's two actions split their row evenly on a phone; beside the
  // summary on a wide screen, or stacked at large text, they keep their size.
  const memberActionStyle = isExpanded || isLargeText ? null : styles.membersAction;
  const viewerIsOwner = members.some(
    (member) => member.user?.id === groupDetail.me?.id && member.role === OWNER_ROLE,
  );

  return (
    <Screen
      header={
        // The bar names the group — emoji, name, type and currency — and
        // the screen does not say it again under it. Archiving and reporting
        // are rare and deliberate, so they wait behind the menu rather than
        // sitting as buttons between the name and the ledger.
        <DetailHeader
          leading={
            <View style={styles.groupEmojiTile}>
              <Text style={styles.groupEmoji}>{groupEmoji(groupDetail.group.type)}</Text>
            </View>
          }
          subtitle={`${groupTypeLabel(groupDetail.group.type)} · ${groupDetail.group.currency}`}
          title={groupDetail.group.name}
          right={
            <OverflowMenu
              items={[
                {
                  label: archived ? GROUP_ARCHIVE_ACTIONS.unarchive : GROUP_ARCHIVE_ACTIONS.archive,
                  icon: archived ? (
                    <ArchiveRestore color={colors.inkSoft} size={18} />
                  ) : (
                    <Archive color={colors.inkSoft} size={18} />
                  ),
                  onSelect: groupDetail.openArchiveDialog,
                  disabled: groupDetail.archivePending,
                },
                {
                  label: GROUP_MENU_COPY.report,
                  icon: <Flag color={colors.inkSoft} size={18} />,
                  onSelect: () => groupDetail.setReportingGroup(true),
                },
              ]}
              label={GROUP_MENU_COPY.trigger}
            />
          }
        />
      }
      onRefresh={groupDetail.refresh}
      refreshing={groupDetail.isRefreshing}
    >
      <View style={styles.overview}>
        {/* Said in words, as in the browser: the screen's main action is
            not left to a bare "+" in the corner. Full width on a phone; on a
            wide screen it keeps to the width of its label. */}
        {groupDetail.group.status === GroupStatus.ACTIVE ? (
          <View style={isExpanded ? styles.addExpenseExpanded : null}>
            <Button
              icon={<Plus color={colors.white} size={18} />}
              label="Add expense"
              onPress={() => router.push(`/expenses/new?group=${groupId}`)}
            />
          </View>
        ) : null}

        {/* Members strip. The avatars-and-names run opens the full member
            list — a truncated line of first names is a summary, not a way to
            reach anyone, and it is where leaving the group lives.

            On a phone the summary takes a row of its own and the two actions
            share the next one, as in the browser. Side by side there was no
            width left for the summary, and a dozen avatars that cannot
            shrink were painted straight over "Add people". The stack is
            capped for the same reason: it has to stay a known width however
            large the group gets. */}
        <View style={[styles.membersCard, isExpanded ? styles.membersCardExpanded : null]}>
          <Pressable
            accessibilityLabel={`View all ${people.length} members`}
            accessibilityRole="button"
            onPress={() => groupDetail.setViewingMembers(true)}
            style={[styles.membersSummary, isExpanded ? styles.membersSummaryExpanded : null]}
          >
            <AvatarStack slots={MEMBERS_STRIP_AVATAR_SLOTS} users={people} />
            <Text numberOfLines={1} style={styles.memberNames}>
              {people
                .map((person) => (person.id === groupDetail.me?.id ? "You" : person.name.split(" ")[0]))
                .join(", ")}
            </Text>
          </Pressable>
          {/* At large text sizes the two would each wrap onto two lines side
              by side, so they stack instead. */}
          <View style={[styles.membersActions, isLargeText ? styles.membersActionsStacked : null]}>
            <View style={memberActionStyle}>
              <Button
                compact
                icon={<UserPlus color={colors.inkSoft} size={14} />}
                label="Add people"
                onPress={() => groupDetail.setAddingPeople(true)}
                variant="outline"
              />
            </View>
            <View style={memberActionStyle}>
              <Button
                busy={groupDetail.sharingInviteLink}
                compact
                icon={<Link2 color={colors.inkSoft} size={14} />}
                label="Invite link"
                onPress={groupDetail.shareInviteLink}
                variant="outline"
              />
            </View>
          </View>
        </View>
        {groupDetail.linkNotice ? (
          <Text style={styles.linkNotice}>{groupDetail.linkNotice}</Text>
        ) : null}
        {/* A failed share is reported under the strip its button sits in. */}
        {groupDetail.linkError ? (
          <Text accessibilityRole="alert" style={styles.linkError}>
            {groupDetail.linkError}
          </Text>
        ) : null}
      </View>

      {archived ? (
        <View style={styles.archivedHint}>
          <Text style={styles.archivedHintText}>{ARCHIVED_GROUP_HINT}</Text>
        </View>
      ) : null}
      {groupDetail.archivePrompt ? (
        <ArchiveGroupSheet
          prompt={groupDetail.archivePrompt}
          pending={groupDetail.archivePending}
          error={groupDetail.archiveError}
          onConfirm={groupDetail.confirmArchiveChange}
          onClose={groupDetail.closeArchiveDialog}
          onViewBalances={groupDetail.viewArchiveBalances}
        />
      ) : null}
      {groupDetail.reportingGroup ? (
        <SafetyDialog
          mode="report"
          onClose={() => groupDetail.setReportingGroup(false)}
          targetId={groupId}
          targetKind="group"
        />
      ) : null}

      {/* Tabs */}
      <Segmented onChange={groupDetail.setTab} options={TABS} value={groupDetail.tab} />

      <Animated.View entering={NOTICE_FADE_IN} key={groupDetail.tab} style={styles.tabContent}>
      {(groupDetail.tab === "expenses" && groupDetail.expensesError) || (groupDetail.tab === "balances" && groupDetail.balancesError) || (groupDetail.tab === "activity" && groupDetail.activityError) ? (
        <ErrorState error={groupDetail.tab === "expenses" ? groupDetail.expensesError : groupDetail.tab === "balances" ? groupDetail.balancesError : groupDetail.activityError} retry={groupDetail.refresh} />
      ) : groupDetail.tab === "expenses" ? (
        <>
          <ExpenseList
            emptyHint="Add the first expense or scan a receipt to get this ledger going."
            expenses={groupDetail.expenses.expenses}
            meId={groupDetail.me?.id}
            settledIds={groupDetail.expenses.settledIds}
            userById={groupDetail.userById}
          />
          <ShowMoreFooter
            endLine={groupDetail.expenses.expenses.length > 0 ? LIST_END_LINE : ""}
            error={groupDetail.loadMoreExpensesError}
            hasMore={groupDetail.hasMoreExpenses}
            isLoadingMore={groupDetail.isLoadingMoreExpenses}
            onShowMore={groupDetail.loadMoreExpenses}
          />
        </>
      ) : groupDetail.tab === "balances" ? (
        <BalancesPanel
          sections={groupDetail.balanceSections}
          error={groupDetail.balancesError ? errorMessage(groupDetail.balancesError) : ""}
          onRetry={groupDetail.reloadBalances}
          meId={groupDetail.me?.id}
          onSettle={(user, cents, received, currency) =>
            groupDetail.setSettleWith({ user, cents, received, currency })
          }
          onToggleSimplified={groupDetail.setSimplified}
          simplified={groupDetail.simplified}
          simplifyPending={groupDetail.simplifyPending}
          simplifyError={groupDetail.simplifyError}
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
          <ShowMoreFooter
            endLine={LIST_END_LINE}
            error={groupDetail.loadMoreActivityError}
            hasMore={groupDetail.activityHasMore}
            isLoadingMore={groupDetail.activityLoadingMore}
            onShowMore={groupDetail.loadMoreActivity}
          />
        </>
      )}

      </Animated.View>

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
              "Leave group" like everyone else.

              Remove, leave and make owner ask before they act: the first
              tap turns that person's row into the question, and only its
              confirm button reaches the server.

              Nothing here fails silently. A removal the ledger will refuse
              is explained instead of offered, with the amount and the way
              to the balances, and no request is sent. Whatever the server
              still refuses, or a row's action confirms, shows under that
              person's row; a line under the whole list is off screen in any
              group long enough to scroll. */}
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
              const armed =
                groupDetail.pendingMemberAction?.userId === person.id
                  ? groupDetail.pendingMemberAction.action
                  : null;
              // Only a removal can be refused for a balance; handing the
              // group over is allowed whatever anyone owes.
              const block =
                armed === "remove"
                  ? memberRemovalBlock(
                      person.name,
                      isMe,
                      memberBuckets(groupDetail.balanceSections ?? [], person.id),
                    )
                  : null;
              const prompt =
                armed && !block ? memberActionPrompt(armed, person.name, isMe) : null;
              const note =
                groupDetail.memberFeedback?.userId === person.id
                  ? groupDetail.memberFeedback
                  : null;
              return (
                <View key={person.id} style={index > 0 ? styles.memberRowDivider : null}>
                  <View style={styles.memberRow}>
                    <PersonLink
                      meId={groupDetail.me?.id}
                      style={styles.memberPerson}
                      userId={person.id}
                    >
                      <Avatar size="sm" user={person} />
                      <Text style={styles.memberName}>
                        {person.name}
                        {isMe ? <Text style={styles.memberTag}> · you</Text> : null}
                        {isOwner ? <Text style={styles.memberTag}> · owner</Text> : null}
                      </Text>
                    </PersonLink>
                    {!isMe && !person.deleted ? <SafetyActions targetKind="user" targetId={person.id} userId={person.id} /> : null}
                    {armed ? null : isMe ? (
                      isOwner ? null : (
                        <Button
                          busy={removing}
                          compact
                          label="Leave group"
                          onPress={() => groupDetail.askMemberAction(person.id, "remove")}
                          variant="outline"
                        />
                      )
                    ) : (
                      <View style={styles.memberActions}>
                        {/* A Deleted member keeps its seat for the money it
                            holds, but there is nobody to befriend. */}
                        {!person.registered ? null : isFriend ? (
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
                              onPress={() => groupDetail.askMemberAction(person.id, "transfer")}
                              variant="outline"
                            />
                            <Button
                              busy={removing}
                              compact
                              label="Remove"
                              onPress={() => groupDetail.askMemberAction(person.id, "remove")}
                              variant="outline"
                            />
                          </>
                        ) : null}
                      </View>
                    )}
                  </View>
                  {/* The question takes the place of the row's buttons, under
                      the name, so a second tap where the first one landed
                      cannot be the one that confirms. */}
                  {block ? (
                    <View accessibilityRole="alert" style={styles.memberBlocked}>
                      <Text style={styles.memberConfirmText}>
                        <Text style={styles.memberConfirmQuestion}>{block.title}.</Text>{" "}
                        {block.detail}
                      </Text>
                      <View style={styles.memberConfirmActions}>
                        <View style={styles.memberConfirmAction}>
                          <Button
                            compact
                            label="Close"
                            onPress={groupDetail.cancelMemberAction}
                            variant="outline"
                          />
                        </View>
                        <View style={styles.memberConfirmAction}>
                          <Button
                            compact
                            label="See balances"
                            onPress={() => {
                              groupDetail.setViewingMembers(false);
                              groupDetail.setTab("balances");
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}
                  {prompt ? (
                    <View style={styles.memberConfirm}>
                      <Text style={styles.memberConfirmText}>
                        <Text style={styles.memberConfirmQuestion}>{prompt.question}</Text>{" "}
                        {prompt.detail}
                      </Text>
                      <View style={styles.memberConfirmActions}>
                        <View style={styles.memberConfirmAction}>
                          <Button
                            compact
                            label="Cancel"
                            onPress={groupDetail.cancelMemberAction}
                            variant="outline"
                          />
                        </View>
                        <View style={styles.memberConfirmAction}>
                          <Button
                            compact
                            label={prompt.confirmLabel}
                            onPress={groupDetail.confirmMemberAction}
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}
                  {note ? (
                    <Text
                      accessibilityRole={note.tone === "error" ? "alert" : "text"}
                      style={[
                        styles.memberNote,
                        note.tone === "error" ? styles.memberNoteError : styles.memberNoteSuccess,
                      ]}
                    >
                      {note.message}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {/* Only what is about the list as a whole lands here, beside the
                control that caused it; anything about one person is on their row. */}
            {groupDetail.memberFeedback && groupDetail.memberFeedback.userId === null ? (
              <Text
                accessibilityRole={groupDetail.memberFeedback.tone === "error" ? "alert" : "text"}
                style={[
                  styles.memberNote,
                  groupDetail.memberFeedback.tone === "error"
                    ? styles.memberNoteError
                    : styles.memberNoteSuccess,
                ]}
              >
                {groupDetail.memberFeedback.message}
              </Text>
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
          footer={
            <View style={styles.addForm}>
              {!groupDetail.inviteOffer && groupDetail.peopleError ? (
                <Text accessibilityRole="alert" style={styles.addError}>{groupDetail.peopleError}</Text>
              ) : null}
              <Button
                busy={groupDetail.addMembers.isPending}
                disabled={!groupDetail.canAddPeople}
                label="Add to group"
                onPress={groupDetail.submitPeople}
              />
            </View>
          }
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
                  disabledHint="deleted their account"
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
                <Text accessibilityRole="alert" style={styles.addHint}>
                  {NOT_ON_HAALKHATA_COPY.group.message}
                </Text>
                <Button
                  busy={groupDetail.sharingLinkForOffer}
                  compact
                  label={NOT_ON_HAALKHATA_COPY.group.action}
                  onPress={groupDetail.shareLinkForOffer}
                />
                <Button
                  compact
                  label="Cancel"
                  onPress={groupDetail.dismissInviteOffer}
                  variant="outline"
                />
              </View>
            ) : null}
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
          currency={groupDetail.settleWith.currency}
          onClose={() => groupDetail.setSettleWith(null)}
          received={groupDetail.settleWith.received}
          // On the group's screen, so it settles this group's balance alone.
          scopeId={groupId}
          suggestedCents={groupDetail.settleWith.cents}
          to={groupDetail.settleWith.user}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabContent: {
    gap: spacing.xl,
  },
  addExpenseExpanded: {
    alignSelf: "flex-start",
  },
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
  archivedHint: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  archivedHintText: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  addLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: -spacing.sm,
  },
  groupEmoji: {
    fontSize: 20,
  },
  groupEmojiTile: {
    alignItems: "center",
    backgroundColor: colors.brand50,
    borderRadius: radii.sm + 2,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  inviteOffer: {
    gap: spacing.sm,
  },
  linkError: {
    color: colors.brand600,
    fontSize: 13,
    fontWeight: "600",
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
    justifyContent: "flex-start",
  },
  memberBlocked: {
    backgroundColor: colors.neg50,
    borderRadius: radii.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  memberConfirm: {
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  memberConfirmAction: {
    flex: 1,
  },
  memberConfirmActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  memberConfirmQuestion: {
    color: colors.ink,
    fontWeight: "600",
  },
  memberConfirmText: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
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
  memberNote: {
    borderRadius: radii.sm,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  memberNoteError: {
    backgroundColor: colors.brand50,
    color: colors.brand700,
  },
  memberNoteSuccess: {
    backgroundColor: colors.pos50,
    color: colors.pos700,
  },
  memberPerson: {
    alignItems: "center",
    width: "100%",
    flexDirection: "row",
    gap: spacing.md,
    minWidth: 0,
  },
  memberRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  memberRowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  membersAction: {
    flex: 1,
  },
  membersActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  membersActionsStacked: {
    flexDirection: "column",
  },
  membersCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  membersList: {
    gap: spacing.sm,
  },
  membersCardExpanded: {
    alignItems: "center",
    flexDirection: "row",
  },
  membersSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 32,
    minWidth: 0,
  },
  membersSummaryExpanded: {
    flex: 1,
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
});
