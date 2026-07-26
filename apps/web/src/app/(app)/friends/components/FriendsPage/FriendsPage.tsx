"use client";
/** Friends route UI: add-by-email-or-phone form, per-friend balances, settle-up. */

import Link from "next/link";
import { Plus, UserPlus, Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Spinner } from "@/components/ui/Spinner";
import { useFriends } from "./hooks/useFriends";

/**
 * Renders the friends page: an add-friend form (email or phone), the list of friends
 * with their net balances and quick actions (one-off expense, settle), and the
 * settle-up modal when a friend is selected.
 *
 * @returns The friends page content, or a spinner while the friend list loads.
 */
export function FriendsPage() {
  const friendsState = useFriends();
  if (friendsState.isLoading) return <Spinner label="Loading friends…" />;
  const currency = friendsState.me?.defaultCurrency ?? "USD";

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Friends</h1>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          friendsState.submitAdd();
        }}
      >
        {/* Deliberately type="text": type="email" makes the browser reject a
            phone number before the form is ever submitted. */}
        <input
          type="text"
          required
          placeholder="Add a friend by email or phone"
          aria-label="Friend's email or phone number"
          value={friendsState.identifier}
          onChange={(event) => friendsState.setIdentifier(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3.5 py-3 focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={friendsState.isAdding}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          <span className="hidden sm:inline">{friendsState.isAdding ? "Adding…" : "Add"}</span>
        </button>
      </form>
      {friendsState.error ? (
        <p className="text-sm font-medium text-brand-600">{friendsState.error}</p>
      ) : null}
      <p className="text-sm text-ink-soft">
        Friends without an account yet are tracked as invited — everything is
        waiting for them when they sign up with that email or number.
      </p>

      {friendsState.friends.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No friends yet"
          hint="Add someone by email or phone to split one-off expenses outside of groups."
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {friendsState.friends.map((friend) =>
            friend.user ? (
              <li key={friend.user.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar user={friend.user} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {friend.user.name}
                    {!friend.user.registered ? (
                      <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                        invited
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {friend.netCents === 0
                      ? "settled up"
                      : friend.netCents > 0
                        ? "owes you"
                        : "you owe"}
                  </p>
                </div>
                {friend.netCents !== 0 ? (
                  <Money cents={friend.netCents} currency={currency} signed className="font-semibold" />
                ) : null}
                <div className="flex shrink-0 gap-1.5">
                  <Link
                    href={`/expenses/new?friend=${friend.user.id}`}
                    title="Add one-off expense"
                    className="rounded-lg border border-line p-2 text-ink-soft hover:border-brand-200 hover:text-brand-600"
                  >
                    <Plus className="h-4 w-4" />
                  </Link>
                  {friend.netCents < 0 ? (
                    <button
                      type="button"
                      onClick={() => friendsState.setSettleWith(friend)}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-pos-600 hover:text-pos-600"
                    >
                      Settle
                    </button>
                  ) : null}
                </div>
              </li>
            ) : null,
          )}
        </ul>
      )}

      {friendsState.settleWith?.user ? (
        <SettleUpModal
          to={friendsState.settleWith.user}
          suggestedCents={-friendsState.settleWith.netCents}
          currency={currency}
          onClose={() => friendsState.setSettleWith(null)}
        />
      ) : null}
    </div>
  );
}
