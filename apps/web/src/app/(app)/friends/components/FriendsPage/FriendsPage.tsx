"use client";
/** Friends route: overall position and four tabs (friends, requests, sent, invited), plus the add-friend dialog. */

import Link from "next/link";
import { ChevronRight, HandCoins, Handshake, UserPlus, Wallet } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmailOrPhoneField } from "@/components/ui/EmailOrPhoneField";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPopup } from "@/components/ui/ErrorPopup";
import { Money } from "@/components/ui/Money";
import { SearchField } from "@/components/ui/SearchField";
import { InviteShareModal } from "@/components/modals/InviteShareModal";
import { Modal } from "@/components/ui/Modal";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { leadingBucket } from "@haalkhata/shared/money/balances";
import type { FriendsTab } from "../../constants/friendsTabs";
import { FriendsTabs } from "./components/FriendsTabs/FriendsTabs";
import { IncomingRequests } from "./components/IncomingRequests/IncomingRequests";
import { InvitedFriends } from "./components/InvitedFriends/InvitedFriends";
import { SentRequests } from "./components/SentRequests/SentRequests";
import { bucketsOf, useFriends } from "./hooks/useFriends";

/**
 * Renders the friends page as four tabs. Friends: your overall position
 * (owed to you / you owe) and a searchable list where each row opens that
 * friendship's ledger, with a settle action that works whichever way the
 * money is owed. Friend requests: what awaits your answer. Sent requests:
 * what you are waiting on. Invited: people you added who have not joined.
 *
 * One list with sections grew past a screen as soon as a few requests were
 * pending; tabs keep each view short and give the pending ones a count you
 * can see without scrolling. Every row is a link rather than a dead readout:
 * a balance you cannot open is a number you cannot check.
 *
 * @returns The friends page content, or a spinner while the friend list loads.
 */
export function FriendsPage() {
  const friendsState = useFriends();
  const hydrated = useHydrated();
  if (!hydrated || friendsState.isLoading) return <Spinner label="Loading friends…" />;
  const currency = friendsState.me?.defaultCurrency ?? "USD";
  const settleTarget = friendsState.settleWith;
  const counts: Record<FriendsTab, number> = {
    friends: friendsState.registeredFriends.length,
    requests: friendsState.incomingRequests.length,
    sent: friendsState.outgoingRequests.length,
    invited: friendsState.invitedFriends.length,
  };

  const addFriendButton = (
    <button
      type="button"
      onClick={() => friendsState.setShowAdd(true)}
      className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
    >
      <UserPlus className="h-4 w-4" /> Add friend
    </button>
  );

  const friendsTab = (
    <>
      {/* One row of cards per currency: a dollar owed and a euro owed are two
          facts, never one total. Nothing outstanding shows zeros in the
          caller's own currency. */}
      {friendsState.registeredFriends.length > 0
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

      {friendsState.registeredFriends.length === 0 ? (
        <EmptyState
          icon={<Handshake />}
          title="No friends yet"
          hint="Send a request by email or phone; they’ll appear here after accepting."
          action={addFriendButton}
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
                {friendsState.visibleFriends.length} of {friendsState.registeredFriends.length}
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
                // One line per currency: a dollar owed and a euro owed are
                // two facts, never one number.
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
                        <p className="truncate font-medium">{person.name}</p>
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
                    {/* Settling is offered whichever way the debt runs: being
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
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Friends</h1>
        {addFriendButton}
      </header>

      {/* Confirmation of the last request sent. The dialog that took it has
          closed by now, so this is the one place it can be read. */}
      {friendsState.notice ? (
        <p
          role="status"
          className="rounded-2xl border border-pos-600/20 bg-pos-50 px-4 py-3 text-sm font-medium text-pos-700"
        >
          {friendsState.notice}
        </p>
      ) : null}

      {friendsState.friendsError ? (
        <p
          role="alert"
          className="rounded-2xl border border-neg-600/20 bg-neg-50 px-4 py-6 text-center text-sm font-medium text-neg-700"
        >
          Couldn&apos;t load your friends: {errorMessage(friendsState.friendsError)}
        </p>
      ) : (
        <>
          <FriendsTabs tab={friendsState.tab} counts={counts} onChange={friendsState.setTab} />
          <div
            role="tabpanel"
            id={`friends-panel-${friendsState.tab}`}
            aria-labelledby={`friends-tab-${friendsState.tab}`}
            className="space-y-6"
          >
            {friendsState.tab === "friends" ? friendsTab : null}
            {friendsState.tab === "requests" ? <IncomingRequests friendsState={friendsState} /> : null}
            {friendsState.tab === "sent" ? <SentRequests friendsState={friendsState} /> : null}
            {friendsState.tab === "invited" ? <InvitedFriends friendsState={friendsState} /> : null}
          </div>
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

      {/* The add form is a dialog, not a panel spliced into the page: it is a
          one-field task, and opening it must not shove the list down. */}
      {friendsState.showAdd ? (
        <Modal title="Add a friend" onClose={() => friendsState.setShowAdd(false)}>
          <form
            className="space-y-3"
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
              autoFocus
            />
            <button
              type="submit"
              disabled={friendsState.isAdding || !friendsState.canSubmitAdd}
              className="w-full rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {friendsState.isAdding ? "Sending…" : "Send request"}
            </button>
          </form>
          <p className="mt-3 text-sm text-ink-soft">
            For privacy, we won’t reveal whether that identifier has an account. They must accept
            before either of you is added as a friend.
          </p>
        </Modal>
      ) : null}

      {/* Add, accept, decline, cancel and remind all report here. Rendered
          after the dialog so a failed send paints above it. */}
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
