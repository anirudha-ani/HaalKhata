"use client";
/** Group detail orchestrator: header with its options menu, members strip, expenses/balances tabs, add-people, report and settle modals. */

import { SafetyDialog } from "@/components/safety/SafetyDialog/SafetyDialog";
import Link from "next/link";
import { Archive, ArchiveRestore, Flag, Plus } from "lucide-react";
import { InviteShareModal } from "@/components/modals/InviteShareModal/InviteShareModal";
import { SettleUpModal } from "@/components/modals/SettleUpModal/SettleUpModal";
import { OverflowMenu } from "@/components/ui/OverflowMenu/OverflowMenu";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import {
  ARCHIVED_GROUP_HINT,
  GROUP_ARCHIVE_ACTIONS,
} from "@haalkhata/shared/group/archiving";
import { GROUP_MENU_COPY } from "@haalkhata/shared/group/groupMenu";
import { errorMessage } from "@/lib/api/connect";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { GroupStatus } from "@haalkhata/shared/group/status";
import { groupEmoji, groupTypeLabel } from "@haalkhata/shared/group/groupTypes";
import { ActivityPanel } from "./components/ActivityPanel/ActivityPanel";
import { ArchiveGroupModal } from "./components/ArchiveGroupModal/ArchiveGroupModal";
import { AddPeopleModal } from "./components/AddPeopleModal/AddPeopleModal";
import { MembersModal } from "./components/MembersModal/MembersModal";
import { MembersStrip } from "./components/MembersStrip/MembersStrip";
import { BalancesPanel } from "./components/BalancesPanel/BalancesPanel";
import { ExpenseList } from "@/components/expenses/ExpenseList/ExpenseList";
import { ErrorAlert } from "@/components/ui/ErrorAlert/ErrorAlert";
import { LoadMoreFooter } from "@/components/ui/LoadMoreFooter/LoadMoreFooter";
import { LIST_END_LINE } from "@haalkhata/shared/api/paging";
import { TABS } from "../../constants/tabs";
import { useGroupDetail } from "./hooks/useGroupDetail";

/**
 * Renders a single group's page: header with the add-expense action and the
 * options menu (archive, report), the members strip, the
 * expenses/balances/activity tab switcher, and the members, add-people,
 * report and settle-up modals.
 *
 * @returns The group detail content, a spinner while loading, or a not-found
 *   message when the group cannot be fetched.
 */
export function GroupDetailPage({
  groupId,
}: {
  /** Identifier of the group to display, taken from the route params. */
  groupId: string;
}) {
  const groupDetail = useGroupDetail(groupId);
  const hydrated = useHydrated();

  if (!hydrated || groupDetail.isLoading) return <Spinner label="Loading group…" />;
  if (!groupDetail.group) {
    return (
      <p className="rounded-2xl border border-line bg-card p-6 text-ink-soft">
        {groupDetail.groupError ? errorMessage(groupDetail.groupError) : "Group not found."}
      </p>
    );
  }

  const archived = groupDetail.group.status === GroupStatus.ARCHIVED;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-3xl">
            {groupEmoji(groupDetail.group.type)}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold break-words sm:text-3xl">{groupDetail.group.name}</h1>
            <p className="text-sm text-ink-soft">
              {groupTypeLabel(groupDetail.group.type)} · {groupDetail.group.currency}
            </p>
          </div>
        </div>
        {/* "Add expense" is said in words at every width. On a phone it takes
            the row under the name, full width, where the name keeps the
            room it needs; from `sm:` up it sits beside the menu. The menu
            keeps to the top right corner, as it does in the app: archiving
            and reporting are rare and deliberate, so they wait behind it
            rather than sitting as buttons between the name and the ledger.
            Both are pinned to the top and set down to the middle of the
            emoji tile, so a name that wraps leaves them in the corner. */}
        {groupDetail.group.status === GroupStatus.ACTIVE ? (
          <Link
            href={`/expenses/new?group=${groupId}`}
            className="order-last flex h-11 basis-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-700 sm:order-none sm:mt-2 sm:h-10 sm:basis-auto"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add expense
          </Link>
        ) : null}
        <div className="shrink-0 pt-2">
          <OverflowMenu
            label={GROUP_MENU_COPY.trigger}
            items={[
              {
                label: archived ? GROUP_ARCHIVE_ACTIONS.unarchive : GROUP_ARCHIVE_ACTIONS.archive,
                icon: archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />,
                onSelect: groupDetail.openArchiveDialog,
                disabled: groupDetail.archivePending,
              },
              {
                label: GROUP_MENU_COPY.report,
                icon: <Flag className="h-4 w-4" />,
                onSelect: () => groupDetail.setReportingGroup(true),
              },
            ]}
          />
        </div>
      </header>

      {archived ? (
        <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm text-ink-soft">
          {ARCHIVED_GROUP_HINT}
        </p>
      ) : null}

      {groupDetail.archivePrompt ? (
        <ArchiveGroupModal
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
          targetKind="group"
          targetId={groupId}
          onClose={() => groupDetail.setReportingGroup(false)}
        />
      ) : null}

      <MembersStrip
        members={groupDetail.group.members ?? []}
        meId={groupDetail.me?.id}
        onViewMembers={() => groupDetail.setViewingMembers(true)}
        onAddPeople={() => groupDetail.setAddingPeople(true)}
        onShareInviteLink={groupDetail.shareInviteLink}
        sharingInviteLink={groupDetail.sharingInviteLink}
      />
      {groupDetail.linkNotice ? (
        <p role="status" className="text-sm font-medium text-pos-700">
          {groupDetail.linkNotice}
        </p>
      ) : null}
      {/* A failed share is reported under the strip its button sits in. */}
      {groupDetail.linkError ? (
        <p role="alert" className="text-sm font-medium text-brand-600">
          {groupDetail.linkError}
        </p>
      ) : null}

      {groupDetail.groupShareToken ? (
        <InviteShareModal
          title="Group invite link"
          explainer={`Anyone who scans this or opens the link can join ${groupDetail.group.name}. They'll see who invited them before accepting.`}
          token={groupDetail.groupShareToken}
          share={groupDetail.shareLinkToSheet}
          onClose={groupDetail.closeGroupShare}
        />
      ) : null}

      {/* Tabs */}
      <div className="grid grid-cols-3 rounded-xl bg-card p-1 text-sm font-semibold ring-1 ring-line">
        {TABS.map((tabOption) => (
          <button
            key={tabOption.value}
            type="button"
            onClick={() => groupDetail.setTab(tabOption.value)}
            className={`rounded-lg py-2 transition-colors ${
              groupDetail.tab === tabOption.value ? "bg-brand-50 text-brand-700" : "text-ink-soft"
            }`}
          >
            {tabOption.label}
          </button>
        ))}
      </div>

      {groupDetail.tab === "expenses" ? (
        groupDetail.expensesError ? (
          <ErrorAlert
            message={`Couldn't load this group's expenses: ${groupDetail.expensesError}`}
            onRetry={groupDetail.reloadExpenses}
          />
        ) : (
          <div className="space-y-3">
            <ExpenseList
              expenses={groupDetail.expenses.expenses}
              meId={groupDetail.me?.id}
              userById={groupDetail.userById}
              emptyHint="Add the first expense or scan a receipt to get this ledger going."
              settledIds={groupDetail.expenses.settledIds}
            />
            <LoadMoreFooter
              hasMore={groupDetail.expensesHasMore}
              isLoadingMore={groupDetail.expensesLoadingMore}
              onLoadMore={groupDetail.loadMoreExpenses}
              error={groupDetail.expensesLoadMoreError}
              endLabel={groupDetail.expenses.expenses.length > 0 ? LIST_END_LINE : ""}
            />
          </div>
        )
      ) : groupDetail.tab === "balances" ? (
        <BalancesPanel
          sections={groupDetail.balanceSections}
          error={groupDetail.balancesError ? errorMessage(groupDetail.balancesError) : ""}
          onRetry={groupDetail.reloadBalances}
          meId={groupDetail.me?.id}
          userById={groupDetail.userById}
          simplified={groupDetail.simplified}
          simplifyPending={groupDetail.simplifyPending}
          simplifyError={groupDetail.simplifyError}
          onToggleSimplified={groupDetail.setSimplified}
          onSettle={(user, cents, received, currency) =>
            groupDetail.setSettleWith({ user, cents, received, currency })
          }
        />
      ) : (
        <ActivityPanel
          events={groupDetail.activityEvents}
          isLoading={groupDetail.activityLoading}
          hasMore={groupDetail.activityHasMore}
          isLoadingMore={groupDetail.activityLoadingMore}
          onLoadMore={groupDetail.loadMoreActivity}
          error={groupDetail.activityError}
          onRetry={groupDetail.reloadActivity}
          loadMoreError={groupDetail.activityLoadMoreError}
        />
      )}

      {groupDetail.viewingMembers ? (
        <MembersModal
          members={groupDetail.group.members ?? []}
          meId={groupDetail.me?.id}
          friendIds={new Set(groupDetail.friends.map((friend) => friend.id))}
          onRemove={groupDetail.removeMember}
          removingUserId={groupDetail.removingUserId}
          onTransfer={groupDetail.transferOwnership}
          transferringUserId={groupDetail.transferringUserId}
          onResetLink={groupDetail.resetInviteLink}
          resettingLink={groupDetail.resettingInviteLink}
          feedback={groupDetail.memberFeedback}
          balances={groupDetail.balanceSections ?? []}
          simplified={groupDetail.simplified}
          onViewBalances={() => {
            groupDetail.setViewingMembers(false);
            groupDetail.setTab("balances");
          }}
          onClose={() => groupDetail.setViewingMembers(false)}
        />
      ) : null}

      {groupDetail.addingPeople ? (
        <AddPeopleModal
          groupName={groupDetail.group.name}
          candidates={groupDetail.candidates}
          pickedIds={groupDetail.pickedIds}
          onToggle={groupDetail.togglePicked}
          contact={groupDetail.contact}
          onContactChange={groupDetail.setContact}
          error={groupDetail.peopleError}
          inviteOffer={groupDetail.inviteOffer}
          onShareLink={groupDetail.shareLinkFromOffer}
          onDismissInvite={groupDetail.dismissInviteOffer}
          canSubmit={groupDetail.canAddPeople}
          isPending={groupDetail.addMembers.isPending}
          onSubmit={groupDetail.submitPeople}
          onClose={() => groupDetail.setAddingPeople(false)}
        />
      ) : null}

      {groupDetail.settleWith ? (
        <SettleUpModal
          to={groupDetail.settleWith.user}
          suggestedCents={groupDetail.settleWith.cents}
          received={groupDetail.settleWith.received}
          currency={groupDetail.settleWith.currency}
          // On the group's page, so it settles this group's balance alone.
          scopeId={groupId}
          onClose={() => groupDetail.setSettleWith(null)}
        />
      ) : null}
    </div>
  );
}
