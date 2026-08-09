"use client";
/** Friend detail: net balance, settle either way, and the full shared ledger with a running balance. */

import Link from "next/link";
import { ArrowLeft, Bell, Check, HandCoins, Plus, UserPlus, Wallet } from "lucide-react";
import { groupEmoji } from "../../../../groups/constants/groupTypes";
import { Avatar } from "@/components/ui/Avatar";
import { Money } from "@/components/ui/Money";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { formatMoney } from "@haalkhata/shared/money/money";
import { localDate } from "@haalkhata/shared/time/localTime";
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
  const isSettled = netCents === 0;
  const theyOweYou = netCents > 0;

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
          <p className="truncate text-sm text-ink-soft">
            {friend.email || friend.phone}
            {!friend.registered ? " · invited" : ""}
          </p>
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
                  disabled={view.isAddingFriend}
                  onClick={view.addFriend}
                  className="flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <UserPlus className="h-3 w-3" />
                  {view.isAddingFriend ? "Adding…" : "Add friend"}
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          {isSettled ? (
            <p className="flex items-center gap-1.5 text-lg font-semibold text-pos-700">
              <Check className="h-5 w-5" /> All settled up
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-soft">
                {theyOweYou ? `${friend.name.split(" ")[0]} owes you` : "you owe"}
              </p>
              <Money
                cents={Math.abs(netCents)}
                currency={currency}
                className={`text-3xl font-bold ${theyOweYou ? "text-pos-700" : "text-neg-600"}`}
              />
            </>
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
        {/* Both directions are always offered: the balance tells you which one
            you probably want, but recording the other is never blocked. */}
        {!theyOweYou && !isSettled ? (
          <button
            type="button"
            onClick={() => view.openSettle("paid")}
            className="flex items-center gap-2 rounded-xl bg-pos-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pos-700"
          >
            <Wallet className="h-4 w-4" /> I paid {friend.name.split(" ")[0]}
          </button>
        ) : null}
        {theyOweYou ? (
          <>
            <button
              type="button"
              onClick={() => view.openSettle("received")}
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

      {groupBalances.length > 1 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
            Where the balance sits
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {groupBalances.map((balance) => (
              <li
                key={balance.groupId || "one-off"}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                  {balance.groupId ? (
                    <Link
                      href={`/groups/${balance.groupId}`}
                      className="font-medium hover:text-brand-600"
                    >
                      {balance.groupName || "Group"}
                    </Link>
                  ) : (
                    <span className="text-ink-soft">One-off expenses</span>
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
                <Money
                  cents={balance.netCents}
                  currency={currency}
                  signed
                  className="font-semibold"
                />
              </li>
            ))}
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
          <div className="overflow-x-auto rounded-2xl border border-line bg-card">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-soft">
                  <th className="py-2 pl-4 text-left font-medium">Date</th>
                  <th className="py-2 pl-3 text-left font-medium">What</th>
                  <th className="py-2 pl-3 text-right font-medium">Total</th>
                  <th className="py-2 pl-3 text-right font-medium">Change</th>
                  <th className="py-2 pr-4 pl-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.kind}-${entry.id}`} className="border-b border-line/60">
                    <td className="py-2.5 pl-4 text-xs whitespace-nowrap text-ink-soft tabular-nums">
                      {/* A settlement is a moment, shown in the viewer's own
                          timezone; an expense's date is the calendar day the
                          user picked, which has no timezone to convert. */}
                      {entry.createdAt ? localDate(entry.createdAt) : entry.date}
                    </td>
                    <td className="py-2.5 pl-3">
                      {entry.kind === "expense" ? (
                        <Link
                          href={`/expenses/${entry.id}`}
                          className="font-medium hover:text-brand-600"
                        >
                          {entry.description}
                        </Link>
                      ) : (
                        <span className="font-medium text-pos-700">{entry.description}</span>
                      )}
                      {entry.groupName ? (
                        <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink-soft">
                          {entry.groupName}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pl-3 text-right text-ink-soft tabular-nums">
                      {formatMoney(entry.totalCents, currency)}
                    </td>
                    {/* The signed column is the one that matters: the expense
                        total is context, your share of it is the movement. */}
                    <td
                      className={`py-2.5 pl-3 text-right font-semibold tabular-nums ${
                        entry.deltaCents > 0 ? "text-pos-700" : "text-neg-600"
                      }`}
                    >
                      {entry.deltaCents > 0 ? "+" : "−"}
                      {formatMoney(Math.abs(entry.deltaCents), currency)}
                    </td>
                    <td className="py-2.5 pr-4 pl-3 text-right tabular-nums">
                      {formatMoney(Math.abs(entry.balanceAfterCents), currency)}
                      <span className="ml-1 text-[11px] text-ink-soft">
                        {entry.balanceAfterCents === 0
                          ? "even"
                          : entry.balanceAfterCents > 0
                            ? "to you"
                            : "to them"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {entries.length > 0 ? (
          <p className="text-xs text-ink-soft">
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
          received={view.settling === "received"}
          suggestedCents={Math.abs(netCents)}
          currency={currency}
          onClose={view.closeSettle}
        />
      ) : null}
    </div>
  );
}
