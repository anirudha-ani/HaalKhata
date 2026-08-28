"use client";
/** Friends route: overall position, searchable friend list linking into each ledger, add-by-email-or-phone. */

import Link from "next/link";
import {
  Check,
  ChevronRight,
  HandCoins,
  Handshake,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { SearchField } from "@/components/ui/SearchField";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Spinner } from "@/components/ui/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { useFriends } from "./hooks/useFriends";

/**
 * Renders the friends page: your overall position (owed to you / you owe), an
 * add-friend form, a searchable list where each row opens that friendship's
 * ledger, and a settle action that works whichever way the money is owed.
 *
 * Every row is a link rather than a dead readout — a balance you cannot open
 * is a number you cannot check.
 *
 * @returns The friends page content, or a spinner while the friend list loads.
 */
export function FriendsPage() {
  const friendsState = useFriends();
  const hydrated = useHydrated();
  if (!hydrated || friendsState.isLoading) return <Spinner label="Loading friends…" />;
  const currency = friendsState.me?.defaultCurrency ?? "USD";
  const settleTarget = friendsState.settleWith;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Friends</h1>
        <button
          type="button"
          onClick={() => friendsState.setShowAdd(!friendsState.showAdd)}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <UserPlus className="h-4 w-4" /> Add friend
        </button>
      </header>

      {friendsState.incomingRequests.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
          <h2 className="font-semibold">Friend requests</h2>
          <ul className="space-y-3">
            {friendsState.incomingRequests.map((requester) => {
              const responding = friendsState.respondingUserId === requester.id;
              return (
                <li key={requester.id} className="flex items-center gap-3">
                  <Avatar user={requester} />
                  <p className="min-w-0 flex-1 truncate font-medium">{requester.name}</p>
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => friendsState.respondToRequest(requester.id, false)}
                    className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft hover:text-neg-600 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Decline
                  </button>
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => friendsState.respondToRequest(requester.id, true)}
                    className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Accept
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {friendsState.friends.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="text-sm text-ink-soft">You are owed</p>
            <Money
              cents={friendsState.owedToYouCents}
              currency={currency}
              className="text-2xl font-bold text-pos-700"
            />
          </div>
          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="text-sm text-ink-soft">You owe</p>
            <Money
              cents={friendsState.youOweCents}
              currency={currency}
              className="text-2xl font-bold text-neg-600"
            />
          </div>
        </div>
      ) : null}

      {friendsState.showAdd || friendsState.friends.length === 0 ? (
        <div className="space-y-2 rounded-2xl border border-line bg-card p-4">
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
              placeholder="Email or phone"
              aria-label="Friend's email or phone number"
              value={friendsState.identifier}
              onChange={(event) => friendsState.setIdentifier(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3.5 py-2.5 focus:border-brand-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={friendsState.isAdding}
              className="rounded-xl bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {friendsState.isAdding ? "Sending…" : "Send request"}
            </button>
          </form>
          {friendsState.error ? (
            <p className="text-sm font-medium text-brand-600">{friendsState.error}</p>
          ) : null}
          {friendsState.notice ? (
            <p className="text-sm font-medium text-pos-700">{friendsState.notice}</p>
          ) : null}
          <p className="text-sm text-ink-soft">
            For privacy, we won’t reveal whether that identifier has an account. They must accept
            before either of you is added as a friend.
          </p>
        </div>
      ) : null}

      {friendsState.friends.length === 0 ? (
        <EmptyState
          icon={<Handshake />}
          title="No friends yet"
          hint="Send a request by email or phone; they’ll appear here after accepting."
        />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <SearchField
              className="flex-1"
              value={friendsState.query}
              onChange={friendsState.setQuery}
              placeholder="Search friends by name"
            />
            {friendsState.query ? (
              <span className="shrink-0 text-sm text-ink-soft tabular-nums">
                {friendsState.visibleFriends.length} of {friendsState.friends.length}
              </span>
            ) : null}
          </div>

          {friendsState.visibleFriends.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card px-4 py-6 text-center text-sm text-ink-soft">
              No friends match “{friendsState.query}”.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {friendsState.visibleFriends.map((friend) =>
                friend.user ? (
                  <li key={friend.user.id} className="flex items-center gap-1">
                    <Link
                      href={`/friends/${friend.user.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-paper"
                    >
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
                        <Money
                          cents={friend.netCents}
                          currency={currency}
                          signed
                          className="font-semibold"
                        />
                      ) : null}
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
                    </Link>
                    {/* Settling is offered whichever way the debt runs — being
                        owed money used to be a dead end with no action at all. */}
                    {friend.netCents !== 0 ? (
                      <button
                        type="button"
                        onClick={() => friendsState.setSettleWith(friend)}
                        title={friend.netCents > 0 ? "Record a payment received" : "Settle up"}
                        className="mr-3 flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-pos-600 hover:text-pos-600"
                      >
                        {friend.netCents > 0 ? (
                          <HandCoins className="h-3.5 w-3.5" />
                        ) : (
                          <Wallet className="h-3.5 w-3.5" />
                        )}
                        Settle
                      </button>
                    ) : null}
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </>
      )}

      {settleTarget?.user ? (
        <SettleUpModal
          to={settleTarget.user}
          received={settleTarget.netCents > 0}
          suggestedCents={Math.abs(settleTarget.netCents)}
          currency={currency}
          onClose={() => friendsState.setSettleWith(null)}
        />
      ) : null}
    </div>
  );
}
