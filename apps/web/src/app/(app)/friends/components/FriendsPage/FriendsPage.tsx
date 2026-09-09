"use client";
/** Friends route: overall position, searchable friend list linking into each ledger, add-by-email-or-phone. */

import Link from "next/link";
import {
  Check,
  ChevronRight,
  Clock,
  HandCoins,
  Handshake,
  Send,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmailOrPhoneField } from "@/components/ui/EmailOrPhoneField";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPopup } from "@/components/ui/ErrorPopup";
import { Money } from "@/components/ui/Money";
import { SearchField } from "@/components/ui/SearchField";
import { InviteShareModal } from "@/components/modals/InviteShareModal";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { leadingBucket } from "@haalkhata/shared/money/balances";
import { bucketsOf, useFriends } from "./hooks/useFriends";

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

      {/* What you sent and are still waiting on. A typed email or phone is
          echoed as typed and never resolved to a name; only someone picked
          off a screen (or reached through your profile link) shows as a
          person. Nothing to open yet: there is no ledger until they accept. */}
      {friendsState.outgoingRequests.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
          <h2 className="font-semibold">Sent requests</h2>
          <ul className="space-y-3">
            {friendsState.outgoingRequests.map((request) => {
              const rowKey = request.user?.id ?? request.identifier;
              return (
                <li key={rowKey} className="flex items-center gap-3">
                  {request.user ? (
                    <Avatar user={request.user} />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft">
                      <Clock className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{request.user?.name ?? request.identifier}</p>
                    <p className="text-xs text-ink-soft">Waiting for them to accept</p>
                  </div>
                  <button
                    type="button"
                    disabled={friendsState.cancellingKey === rowKey}
                    onClick={() => friendsState.cancelSentRequest(request)}
                    className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft hover:text-neg-600 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* One row of cards per currency: a dollar owed and a euro owed are two
          facts, never one total. Nothing outstanding shows zeros in the
          caller's own currency. */}
      {friendsState.friends.length > 0
        ? (friendsState.totals.length > 0
            ? friendsState.totals
            : [{ currency, owedToYouCents: 0, youOweCents: 0 }]
          ).map((total) => (
            <div key={total.currency} className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-line bg-card p-4">
                <p className="text-sm text-ink-soft">
                  You are owed{friendsState.totals.length > 1 ? ` · ${total.currency}` : ""}
                </p>
                <Money
                  cents={total.owedToYouCents}
                  currency={total.currency}
                  className="text-2xl font-bold text-pos-700"
                />
              </div>
              <div className="rounded-2xl border border-line bg-card p-4">
                <p className="text-sm text-ink-soft">
                  You owe{friendsState.totals.length > 1 ? ` · ${total.currency}` : ""}
                </p>
                <Money
                  cents={total.youOweCents}
                  currency={total.currency}
                  className="text-2xl font-bold text-neg-600"
                />
              </div>
            </div>
          ))
        : null}

      {friendsState.showAdd || friendsState.friends.length === 0 ? (
        <div className="space-y-2 rounded-2xl border border-line bg-card p-4">
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              friendsState.submitAdd();
            }}
          >
            <EmailOrPhoneField
              contact={friendsState.contact}
              onContactChange={friendsState.setContact}
              emailLabel="Friend's email address"
              phoneLabel="Friend's phone number"
            />
            <button
              type="submit"
              disabled={friendsState.isAdding || !friendsState.canSubmitAdd}
              className="w-full rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {friendsState.isAdding ? "Sending…" : "Send request"}
            </button>
          </form>
          {friendsState.notice ? (
            <p className="text-sm font-medium text-pos-700">{friendsState.notice}</p>
          ) : null}
          <p className="text-sm text-ink-soft">
            For privacy, we won’t reveal whether that identifier has an account. They must accept
            before either of you is added as a friend.
          </p>
        </div>
      ) : null}

      {friendsState.friendsError ? (
        <p
          role="alert"
          className="rounded-2xl border border-neg-600/20 bg-neg-50 px-4 py-6 text-center text-sm font-medium text-neg-700"
        >
          Couldn&apos;t load your friends — {errorMessage(friendsState.friendsError)}
        </p>
      ) : friendsState.friends.length === 0 ? (
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
              {friendsState.visibleFriends.map((friend) => {
                if (!friend.user) return null;
                const person = friend.user;
                // One line per currency — a dollar owed and a euro owed
                // are two facts, never one number.
                const buckets = bucketsOf(friend, currency);
                const lead = leadingBucket(buckets);
                return (
                  <li key={person.id} className="flex items-center gap-1">
                    <Link
                      href={`/friends/${person.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-paper"
                    >
                      <Avatar user={person} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {person.name}
                          {!person.registered ? (
                            <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                              invited
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {buckets.length === 0
                            ? "settled up"
                            : buckets.every((bucket) => bucket.cents > 0)
                              ? "owes you"
                              : buckets.every((bucket) => bucket.cents < 0)
                                ? "you owe"
                                : "owes you · you owe"}
                        </p>
                      </div>
                      <span className="flex flex-col items-end">
                        {buckets.map((bucket) => (
                          <Money
                            key={bucket.currency}
                            cents={bucket.cents}
                            currency={bucket.currency}
                            signed
                            className="font-semibold"
                          />
                        ))}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
                    </Link>
                    {/* Settling is offered whichever way the debt runs — being
                        owed money used to be a dead end with no action at all.
                        It opens on the largest balance; the dialog can switch
                        currency. */}
                    {lead ? (
                      <button
                        type="button"
                        onClick={() =>
                          friendsState.setSettleWith({
                            user: person,
                            currency: lead.currency,
                            cents: lead.cents,
                          })
                        }
                        title={lead.cents > 0 ? "Record a payment received" : "Settle up"}
                        className="mr-3 flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-pos-600 hover:text-pos-600"
                      >
                        {lead.cents > 0 ? (
                          <HandCoins className="h-3.5 w-3.5" />
                        ) : (
                          <Wallet className="h-3.5 w-3.5" />
                        )}
                        Settle
                      </button>
                    ) : !person.registered ? (
                      /* An invited person has no balance to settle; the useful
                         action is nudging them to sign up. The link claims
                         their invited identity, seats and all. */
                      <button
                        type="button"
                        disabled={friendsState.remindingUserId === person.id}
                        onClick={() => friendsState.remindFriend(person)}
                        className="mr-3 flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {friendsState.remindingUserId === person.id ? "Opening…" : "Remind"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {friendsState.remindShare ? (
        <InviteShareModal
          title="Remind them to sign up"
          explainer={`This link signs ${friendsState.remindShare.personName} up and claims their invited identity, friendships and group seats included.`}
          token={friendsState.remindShare.token}
          share={friendsState.remindShareToSheet}
          onClose={friendsState.closeRemindShare}
        />
      ) : null}

      {/* Add, accept, decline and cancel all report here. A line inside the
          add form was invisible whenever that form was closed. */}
      <ErrorPopup message={friendsState.error} onDismiss={friendsState.dismissError} />

      {settleTarget ? (
        <SettleUpModal
          to={settleTarget.user}
          received={settleTarget.cents > 0}
          suggestedCents={Math.abs(settleTarget.cents)}
          currency={settleTarget.currency}
          onClose={() => friendsState.setSettleWith(null)}
        />
      ) : null}
    </div>
  );
}
