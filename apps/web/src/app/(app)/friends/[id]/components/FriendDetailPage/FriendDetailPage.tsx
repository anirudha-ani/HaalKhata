"use client";
/** Friend detail: net balance per currency, settle either way, and the full shared ledger with a running balance. */

import Link from "next/link";
import { ArrowLeft, Bell, Check, HandCoins, Plus, UserPlus, Wallet } from "lucide-react";
import { groupEmoji } from "../../../../groups/constants/groupTypes";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { Money } from "@/components/ui/Money/Money";
import { SettleUpModal } from "@/components/modals/SettleUpModal/SettleUpModal";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { scopeLabel } from "@haalkhata/shared/expense/settlePosition";
import { outstandingBuckets } from "@haalkhata/shared/money/balances";
import { LedgerStatement } from "./components/LedgerStatement/LedgerStatement";
import { useFriendLedger } from "./hooks/useFriendLedger";

/**
 * Renders everything about one friendship: who owes whom right now, the
 * actions that change it, the per-group breakdown when the balance is spread
 * across groups, and the full history as a statement — every expense and
 * payment, what each did to the balance, and the balance after it.
 *
 * The running balance is the point: a total nobody can check line by line is
 * a number people argue about.
 *
 * @param props - Component props.
 * @returns The friend detail page content.
 */
export function FriendDetailPage({
  friendId,
}: {
  /** User id of the friend whose ledger is shown. */
  friendId: string;
}) {
  const view = useFriendLedger(friendId);
  const hydrated = useHydrated();

  if (!hydrated || view.isLoading) return <Spinner label="Loading…" />;
  if (view.error || !view.ledger?.friend) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-card p-6">
        <p className="text-sm text-ink-soft">
          {view.error ? errorMessage(view.error) : "That person could not be found."}
        </p>
        <Link href="/friends" className="mt-4 inline-block font-medium text-brand-600">
          Back to friends
        </Link>
      </div>
    );
  }

  // Defaults guard against a cached response from before these fields
  // existed: the query renders its cache first, and an object built by the
  // old generated class simply lacks the properties — undefined, not empty.
  const {
    friend,
    netCents,
    currency,
    entries,
    groupBalances,
    isFriend = true,
    mutualGroups = [],
  } = view.ledger;
  // One net per currency, never a sum: a server predating `nets` sends only
  // the default-currency scalar, which reads the same way as one bucket.
  const nets = outstandingBuckets(
    view.ledger.nets?.length ? view.ledger.nets : [{ currency, cents: netCents }],
    currency,
  );
  const isSettled = nets.length === 0;
  // Nothing changes hands overall, yet balances remain: what is owed one way
  // in one place equals what is owed back in another. "Settled up" would be
  // wrong — each of those places still shows its balance.
  const isEvenOnly = isSettled && groupBalances.some((balance) => balance.netCents !== 0);
  /**
   * What a settle dialog would settle for one row of the breakdown, as the
   * server computes it; undefined when there is nothing to settle there.
   *
   * @param scopeGroupId - The row's group id, or "" for what is not in any group.
   * @param scopeCurrency - The row's currency.
   * @returns The matching balance from the pair's settle position.
   */
  const settleScopeFor = (scopeGroupId: string, scopeCurrency: string) =>
    (view.ledger?.settlePositions ?? [])
      .find((position) => position.currency === scopeCurrency)
      ?.scopes.find((scope) => scope.groupId === scopeGroupId && scope.netCents !== 0);
  const owedToYou = nets.filter((bucket) => bucket.cents > 0);
  const owedByYou = nets.filter((bucket) => bucket.cents < 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/friends"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" /> Friends
      </Link>

      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-card p-5">
        <Avatar user={friend} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{friend.name}</h1>
          {/* Their email and phone are private — the server sends them empty
              for anyone but yourself — so the only thing worth a line here is
              whether they have signed in yet. */}
          {!friend.registered ? (
            <p className="truncate text-sm text-ink-soft">Invited — hasn&apos;t signed in yet</p>
          ) : null}
          {/* Where you know each other from — every shared group, settled
              ones included, each a link. And when this page is showing a
              pair rather than a friendship (any name anywhere links here),
              the way to make it one is a tap, not a form. */}
          {mutualGroups.length > 0 || !isFriend ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {mutualGroups.map((mutual) => (
                <Link
                  key={mutual.groupId}
                  href={`/groups/${mutual.groupId}`}
                  className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                >
                  {groupEmoji(mutual.groupType)} {mutual.groupName}
                </Link>
              ))}
              {!isFriend ? (
                <button
                  type="button"
                  disabled={view.isAddingFriend || view.friendRequestSent}
                  onClick={view.addFriend}
                  className="flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <UserPlus className="h-3 w-3" />
                  {view.isAddingFriend
                    ? "Sending…"
                    : view.friendRequestSent
                      ? "Requested"
                      : "Request friendship"}
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          {isEvenOnly ? (
            <p className="text-lg font-semibold text-ink-soft">Even overall</p>
          ) : isSettled ? (
            <p className="flex items-center gap-1.5 text-lg font-semibold text-pos-700">
              <Check className="h-5 w-5" /> All settled up
            </p>
          ) : (
            // One line per currency: a dollar owed and a euro owed are two
            // facts, and no arithmetic turns them into one.
            nets.map((bucket) => (
              <div key={bucket.currency}>
                <p className="text-sm text-ink-soft">
                  {bucket.cents > 0 ? `${friend.name.split(" ")[0]} owes you` : "you owe"}
                </p>
                <Money
                  cents={Math.abs(bucket.cents)}
                  currency={bucket.currency}
                  className={`text-3xl font-bold ${bucket.cents > 0 ? "text-pos-700" : "text-neg-600"}`}
                />
              </div>
            ))
          )}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/expenses/new?friend=${friend.id}`}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Add expense
        </Link>
        {/* Beside the totals, so these settle the totals: everything with this
            person in the currency, whichever places it sits in. Settling one
            place alone is done from its own row below. Each opens on its
            currency; the dialog can switch. */}
        {owedByYou.length > 0 ? (
          <button
            type="button"
            onClick={() => view.openSettle("paid", owedByYou[0].currency)}
            className="flex items-center gap-2 rounded-xl bg-pos-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pos-700"
          >
            <Wallet className="h-4 w-4" /> I paid {friend.name.split(" ")[0]}
          </button>
        ) : null}
        {owedToYou.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => view.openSettle("received", owedToYou[0].currency)}
              className="flex items-center gap-2 rounded-xl bg-pos-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pos-700"
            >
              <HandCoins className="h-4 w-4" /> {friend.name.split(" ")[0]} paid me
            </button>
            <button
              type="button"
              onClick={view.sendReminder}
              disabled={view.isReminding}
              className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50"
            >
              <Bell className="h-4 w-4" /> {view.isReminding ? "Sending…" : "Send a reminder"}
            </button>
          </>
        ) : null}
      </div>

      {view.reminderNote ? (
        <p className="text-sm font-medium text-ink-soft">{view.reminderNote}</p>
      ) : null}

      {isFriend ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!isSettled || view.isRemovingFriend}
            onClick={view.removeFriend}
            className="text-sm font-semibold text-ink-soft underline-offset-2 hover:text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {view.isRemovingFriend
              ? "Removing…"
              : view.confirmingRemoval
                ? "Click again to confirm"
                : "Remove friend"}
          </button>
          {view.confirmingRemoval && !view.isRemovingFriend ? (
            <button
              type="button"
              onClick={view.cancelRemoval}
              className="text-sm text-ink-soft underline-offset-2 hover:underline"
            >
              Cancel
            </button>
          ) : null}
          {!isSettled ? (
            <span className="text-xs text-ink-soft">
              You can remove a friend once every balance is settled.
            </span>
          ) : null}
        </div>
      ) : null}

      {groupBalances.length > 1 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
            Where the balance sits
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {groupBalances.map((balance) => {
              const label = scopeLabel(balance.groupId, balance.groupName);
              const settleScope = settleScopeFor(balance.groupId, balance.currency || currency);
              return (
                <li
                  key={`${balance.groupId || "one-off"}-${balance.currency}`}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    {balance.groupId ? (
                      <Link
                        href={`/groups/${balance.groupId}`}
                        className="truncate font-medium hover:text-brand-600"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="truncate text-ink-soft">{label}</span>
                    )}
                    {/* A rerouted number needs its label: in a simplified group
                        what you pay — and whom — is the group's shortest route,
                        not necessarily who you shared the expense with. */}
                    {balance.simplified ? (
                      <span
                        className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink-soft"
                        title="This group simplifies debts: balances are rerouted across the group so fewer payments settle everyone."
                      >
                        simplified
                      </span>
                    ) : null}
                  </span>
                  {/* Worded the way the dialog it opens words it, so the row
                      and the dialog are plainly the same balance — and so
                      the direction does not rest on colour alone. */}
                  <span className="shrink-0 text-xs text-ink-soft">
                    {balance.netCents > 0 ? "owes you" : "you owe"}
                  </span>
                  <Money
                    cents={balance.netCents}
                    currency={balance.currency || currency}
                    signed
                    className="shrink-0 font-semibold"
                  />
                  {/* On the row, so it settles the row: this one balance and
                      nothing else. */}
                  {settleScope ? (
                    <button
                      type="button"
                      aria-label={`Settle ${label} only`}
                      onClick={() =>
                        view.openSettle(
                          settleScope.netCents > 0 ? "received" : "paid",
                          balance.currency || currency,
                          balance.groupId,
                        )
                      }
                      className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600"
                    >
                      Settle
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">History</h2>

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-line bg-card px-4 py-10 text-center">
            <Check className="mx-auto h-8 w-8 text-pos-600" />
            <p className="mt-2 font-semibold">Nothing shared yet</p>
            <p className="mt-1 text-sm text-ink-soft">
              Add an expense with {friend.name.split(" ")[0]} and it will show up here.
            </p>
          </div>
        ) : (
          <LedgerStatement
            entries={entries}
            currency={currency}
            confirmingSettlementId={view.confirmingSettlementId}
            removingSettlementId={view.removingSettlementId}
            removalError={view.settlementRemovalError}
            onRemoveSettlement={view.removeSettlement}
          />
        )}
        {entries.length > 0 ? (
          <p className="text-xs text-ink-soft">
            {view.ledger.truncated
              ? "Showing the most recent lines — older ones still count toward every balance. "
              : ""}
            &ldquo;Change&rdquo; is what each line did to your balance; positive means it went in
            your favour.{" "}
            {groupBalances.some((balance) => balance.simplified)
              ? "Groups marked “simplified” reroute debts across the whole group, so the balance up top can differ from this history's running total — the history is what you shared, the headline is what actually needs to move."
              : "The top row's balance is where you stand now."}
          </p>
        ) : null}
      </section>

      {view.settling ? (
        <SettleUpModal
          to={friend}
          received={view.settling.direction === "received"}
          suggestedCents={Math.abs(
            view.settling.scopeId === undefined
              ? (nets.find((bucket) => bucket.currency === view.settling?.currency)?.cents ?? 0)
              : (settleScopeFor(view.settling.scopeId, view.settling.currency)?.netCents ?? 0),
          )}
          currency={view.settling.currency}
          scopeId={view.settling.scopeId}
          onClose={view.closeSettle}
        />
      ) : null}
    </div>
  );
}
