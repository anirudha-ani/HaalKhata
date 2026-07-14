"use client";
/** Groups route UI: group summary cards and the new-group modal. */

import Link from "next/link";
import { Plus, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Spinner } from "@/components/ui/Spinner";
import { CURRENCIES } from "@/lib/money/money.constants";
import { GROUP_TYPES, groupEmoji } from "../../constants/groupTypes";
import { useGroups } from "./hooks/useGroups";

/**
 * Renders the groups page: a card grid of group summaries (member count and
 * your net balance per group) and a modal form for creating a new group.
 *
 * @returns The groups page content, or a spinner while the group list loads.
 */
export function GroupsPage() {
  const groupsState = useGroups();
  if (groupsState.isLoading) return <Spinner label="Loading groups…" />;

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
          icon={<UsersRound />}
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
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groupsState.groups.map((summary) =>
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
              <select
                value={groupsState.currency}
                onChange={(event) => groupsState.setCurrency(event.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2.5 focus:border-brand-500 focus:outline-none"
              >
                {CURRENCIES.map((currencyCode) => (
                  <option key={currencyCode}>{currencyCode}</option>
                ))}
              </select>
            </label>
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
