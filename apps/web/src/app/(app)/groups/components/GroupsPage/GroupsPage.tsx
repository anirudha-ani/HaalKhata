"use client";
/** Groups route UI: group summary cards and the new-group modal. */

import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { FriendChecklist } from "@/components/people/FriendChecklist";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { SearchField } from "@/components/ui/SearchField";
import { Spinner } from "@/components/ui/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { GROUP_BALANCE_FILTERS, noGroupsMessage } from "@haalkhata/shared/group/balanceFilter";
import { GROUP_TYPES, groupEmoji } from "../../constants/groupTypes";
import { useGroups } from "./hooks/useGroups";
import { MAX_GROUP_NAME_LENGTH } from "@haalkhata/shared/text/limits";

/**
 * Renders the groups page: a card grid of group summaries (member count and
 * your net balance per group) and a modal form for creating a new group.
 *
 * @returns The groups page content, or a spinner while the group list loads.
 */
export function GroupsPage() {
  const groupsState = useGroups();
  const hydrated = useHydrated();
  if (!hydrated || groupsState.isLoading) return <Spinner label="Loading groups…" />;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Groups</h1>
        <button
          type="button"
          onClick={() => groupsState.setCreating(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New group
        </button>
      </header>

      {groupsState.groups.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No groups yet"
          hint="Start a group for a trip, your flat, or anything you share costs on."
          action={
            <button
              type="button"
              onClick={() => groupsState.setCreating(true)}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Create your first group
            </button>
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <SearchField
              className="flex-1"
              value={groupsState.query}
              onChange={groupsState.setQuery}
              placeholder="Search groups by name or type"
            />
            {/* The count now has to account for the balance filter too, or it
                would read as unfiltered while rows are being hidden. */}
            {groupsState.query || groupsState.balance !== "all" ? (
              <span className="shrink-0 text-sm text-ink-soft tabular-nums">
                {groupsState.visibleGroups.length} of {groupsState.groups.length}
              </span>
            ) : null}
          </div>

          {/* Filter state stays visible while it hides rows, matching the
              activity feed: the active button is styled, not just remembered. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {GROUP_BALANCE_FILTERS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                aria-pressed={groupsState.balance === entry.value}
                onClick={() => groupsState.setBalance(entry.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  groupsState.balance === entry.value
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-line text-ink-soft hover:border-brand-200"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {groupsState.visibleGroups.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card px-4 py-6 text-center text-sm text-ink-soft">
              {noGroupsMessage(groupsState.query, groupsState.balance)}
            </p>
          ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groupsState.visibleGroups.map((summary) =>
            summary.group ? (
              <li key={summary.group.id}>
                <Link
                  href={`/groups/${summary.group.id}`}
                  className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-line bg-card p-5 transition-shadow hover:border-brand-200 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-3xl">{groupEmoji(summary.group.type)}</span>
                    <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink-soft capitalize">
                      {summary.group.type}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{summary.group.name}</h2>
                    <p className="text-sm text-ink-soft">
                      {summary.memberCount} member{summary.memberCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="text-sm">
                    {summary.yourNetCents === 0 ? (
                      <span className="text-ink-soft">all settled up</span>
                    ) : (
                      <>
                        <span className="text-ink-soft">
                          {summary.yourNetCents > 0 ? "you are owed " : "you owe "}
                        </span>
                        <Money
                          cents={summary.yourNetCents}
                          currency={summary.group.currency}
                          signed
                          className="font-semibold"
                        />
                      </>
                    )}
                  </p>
                </Link>
              </li>
            ) : null,
          )}
        </ul>
          )}
        </>
      )}

      {groupsState.creating ? (
        <Modal title="New group" onClose={() => groupsState.setCreating(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              groupsState.submitCreate();
            }}
          >
            <input
              autoFocus
              placeholder="Group name (e.g. Mymensingh Trip)"
              aria-label="Group name"
              value={groupsState.name}
              onChange={(event) => groupsState.setName(event.target.value)}
              maxLength={MAX_GROUP_NAME_LENGTH}
              required
              className="w-full rounded-xl border border-line bg-card px-3.5 py-3 focus:border-brand-500 focus:outline-none"
            />
            <div className="grid grid-cols-4 gap-2">
              {GROUP_TYPES.map((groupType) => (
                <button
                  key={groupType.value}
                  type="button"
                  onClick={() => groupsState.setType(groupType.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium ${
                    groupsState.type === groupType.value
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-line text-ink-soft"
                  }`}
                >
                  <span className="text-xl">{groupType.emoji}</span>
                  {groupType.label}
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium">
              Currency
              <CurrencySelect value={groupsState.currency} onChange={groupsState.setCurrency} />
              <p className="mt-1 text-xs font-normal text-ink-soft">
                Every expense and balance in the group lives in this currency. It cannot be
                changed after the group is created.
              </p>
            </label>

            {/* Members at creation, so a new group is not born empty and then
                needing a second trip through a separate invite dialog. */}
            {groupsState.friends.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Who&apos;s in?{" "}
                  <span className="font-normal text-ink-soft">
                    {groupsState.memberIds.length > 0
                      ? `${groupsState.memberIds.length} selected`
                      : "optional — you can add people later"}
                  </span>
                </p>
                <div className="rounded-xl border border-line bg-paper p-2">
                  <FriendChecklist
                    people={groupsState.friends}
                    selectedIds={groupsState.memberIds}
                    onToggle={groupsState.toggleMember}
                    legend="People to add to this group"
                    disabledIds={
                      new Set(
                        groupsState.friends
                          .filter((friend) => !friend.registered)
                          .map((friend) => friend.id),
                      )
                    }
                    disabledHint="invited — can add once they join"
                  />
                </div>
              </div>
            ) : null}

            {groupsState.error ? <p className="text-sm text-brand-600">{groupsState.error}</p> : null}
            <button
              type="submit"
              disabled={groupsState.isCreating}
              className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {groupsState.isCreating ? "Creating…" : "Create group"}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
