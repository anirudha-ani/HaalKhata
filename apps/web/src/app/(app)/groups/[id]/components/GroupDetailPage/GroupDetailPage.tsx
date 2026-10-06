"use client";
/** Group detail orchestrator: header, members strip, expenses/balances tabs, add-people and settle modals. */

import Link from "next/link";
import { Plus } from "lucide-react";
import { InviteShareModal } from "@/components/modals/InviteShareModal/InviteShareModal";
import { SettleUpModal } from "@/components/modals/SettleUpModal/SettleUpModal";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { groupEmoji } from "../../../constants/groupTypes";
import { ActivityPanel } from "./components/ActivityPanel/ActivityPanel";
import { AddPeopleModal } from "./components/AddPeopleModal/AddPeopleModal";
import { MembersModal } from "./components/MembersModal/MembersModal";
import { MembersStrip } from "./components/MembersStrip/MembersStrip";
import { BalancesPanel } from "./components/BalancesPanel/BalancesPanel";
import { ExpenseList } from "@/components/expenses/ExpenseList/ExpenseList";
import { TABS } from "../../constants/tabs";
import { useGroupDetail } from "./hooks/useGroupDetail";

/**
 * Renders a single group's page: header with the add-expense action, the
 * members strip, the expenses/balances/activity tab switcher, and the
 * members, add-people and settle-up modals.
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-3xl">
            {groupEmoji(groupDetail.group.type)}
          </span>
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{groupDetail.group.name}</h1>
            <p className="text-sm text-ink-soft capitalize">
              {groupDetail.group.type} · {groupDetail.group.currency}
            </p>
          </div>
        </div>
        {/* One button, not two: scanning a receipt is how you fill the expense
            form in, so "Scan receipt" was a second door to the same room. */}
        <Link
          href={`/expenses/new?group=${groupId}`}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Add expense
        </Link>
      </header>

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
        <ExpenseList
          expenses={groupDetail.expenses?.expenses ?? []}
          meId={groupDetail.me?.id}
          userById={groupDetail.userById}
          emptyHint="Add the first expense or scan a receipt to get this ledger going."
          settledIds={new Set(groupDetail.expenses?.settledExpenseIds ?? [])}
        />
      ) : groupDetail.tab === "balances" ? (
        <BalancesPanel
          balances={groupDetail.balances}
          currency={groupDetail.group.currency}
          meId={groupDetail.me?.id}
          userById={groupDetail.userById}
          simplified={groupDetail.simplified}
          simplifyPending={groupDetail.simplifyPending}
          simplifyError={groupDetail.simplifyError}
          onToggleSimplified={groupDetail.setSimplified}
          onSettle={(user, cents, received) =>
            groupDetail.setSettleWith({ user, cents, received })
          }
        />
      ) : (
        <ActivityPanel
          events={groupDetail.activityEvents}
          isLoading={groupDetail.activityLoading}
          hasMore={groupDetail.activityHasMore}
          isLoadingMore={groupDetail.activityLoadingMore}
          onLoadMore={groupDetail.loadMoreActivity}
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
          onRemind={groupDetail.remindMember}
          remindingUserId={groupDetail.remindingUserId}
          onResetLink={groupDetail.resetInviteLink}
          resettingLink={groupDetail.resettingInviteLink}
          feedback={groupDetail.memberFeedback}
          nets={groupDetail.balances?.nets ?? []}
          currency={groupDetail.group.currency}
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
          onSendInvite={groupDetail.sendSignUpInvite}
          sendingInvite={groupDetail.sendingSignUpInvite}
          onDismissInvite={groupDetail.dismissInviteOffer}
          canSubmit={groupDetail.canAddPeople}
          isPending={groupDetail.addMembers.isPending}
          onSubmit={groupDetail.submitPeople}
          onClose={() => groupDetail.setAddingPeople(false)}
        />
      ) : null}

      {groupDetail.signUpShare ? (
        <InviteShareModal
          title="Sign-up invite"
          explainer={`This link signs ${groupDetail.signUpShare.contact} up and connects you as friends. Once they join, you can add them to ${groupDetail.group.name}.`}
          token={groupDetail.signUpShare.token}
          share={groupDetail.signUpShareToSheet}
          onClose={groupDetail.closeSignUpShare}
        />
      ) : null}

      {groupDetail.settleWith ? (
        <SettleUpModal
          to={groupDetail.settleWith.user}
          suggestedCents={groupDetail.settleWith.cents}
          received={groupDetail.settleWith.received}
          currency={groupDetail.group.currency}
          // On the group's page, so it settles this group's balance alone.
          scopeId={groupId}
          onClose={() => groupDetail.setSettleWith(null)}
        />
      ) : null}
    </div>
  );
}
