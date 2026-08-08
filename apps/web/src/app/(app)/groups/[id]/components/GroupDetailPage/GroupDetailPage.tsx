"use client";
/** Group detail orchestrator: header, members strip, expenses/balances tabs, add-people and settle modals. */

import Link from "next/link";
import { Plus, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { groupEmoji } from "../../../constants/groupTypes";
import { AddPeopleModal } from "./components/AddPeopleModal/AddPeopleModal";
import { BalancesPanel } from "./components/BalancesPanel/BalancesPanel";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { TABS } from "../../constants/tabs";
import { useGroupDetail } from "./hooks/useGroupDetail";

/**
 * Renders a single group's page: header with the add-expense action, the
 * member avatar strip with an add-people button, the expenses/balances tab
 * switcher, and the add-people and settle-up modals.
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

      {/* Members strip */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-line bg-card px-4 py-3">
        <div className="flex -space-x-2">
          {(groupDetail.group.members ?? []).map((member) =>
            member.user ? <Avatar key={member.user.id} user={member.user} size="sm" ring /> : null,
          )}
        </div>
        <p className="min-w-0 flex-1 truncate text-sm text-ink-soft">
          {(groupDetail.group.members ?? [])
            .flatMap((member) =>
              member.user
                ? [member.user.id === groupDetail.me?.id ? "You" : member.user.name.split(" ")[0]]
                : [],
            )
            .join(", ")}
        </p>
        <button
          type="button"
          onClick={() => groupDetail.setAddingPeople(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600"
        >
          <UserPlus className="h-3.5 w-3.5" /> Add people
        </button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 rounded-xl bg-card p-1 text-sm font-semibold ring-1 ring-line">
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
        />
      ) : (
        <BalancesPanel
          balances={groupDetail.balances}
          currency={groupDetail.group.currency}
          meId={groupDetail.me?.id}
          userById={groupDetail.userById}
          simplified={groupDetail.simplified}
          onToggleSimplified={groupDetail.setSimplified}
          onSettle={(user, cents, received) =>
            groupDetail.setSettleWith({ user, cents, received })
          }
        />
      )}

      {groupDetail.addingPeople ? (
        <AddPeopleModal
          groupName={groupDetail.group.name}
          candidates={groupDetail.candidates}
          pickedIds={groupDetail.pickedIds}
          onToggle={groupDetail.togglePicked}
          identifier={groupDetail.identifier}
          onIdentifierChange={groupDetail.setIdentifier}
          error={groupDetail.peopleError}
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
          currency={groupDetail.group.currency}
          groupId={groupId}
          onClose={() => groupDetail.setSettleWith(null)}
        />
      ) : null}
    </div>
  );
}
