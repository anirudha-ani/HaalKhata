"use client";
/** Dashboard page: balance summary, per-person balances with settle-up, recent activity. */

import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { PersonLink } from "@/components/people/PersonLink";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { leadingBucket, outstandingBuckets } from "@haalkhata/shared/money/balances";
import { formatMoney } from "@haalkhata/shared/money/money";
import { safeActivityPath } from "@haalkhata/shared/navigation/activityPath";
import { localDate } from "@haalkhata/shared/time/localTime";
import { getGreeting } from "@haalkhata/shared/greeting";
import { groupEmoji } from "../../../groups/constants/groupTypes";
import { useDashboard } from "./hooks/useDashboard";

/**
 * Renders the dashboard: greeting header with quick actions, the three-card
 * balance summary, per-person balances with a settle-up flow, and the most
 * recent activity entries.
 *
 * @returns The dashboard page content (spinner while loading).
 */
export function DashboardPage() {
  const dashboard = useDashboard();
  const hydrated = useHydrated();
  if (!hydrated || dashboard.isLoading) return <Spinner label="Opening your ledger…" />;

  const currency = dashboard.me?.defaultCurrency ?? "USD";
  // A failed balance query (the RPC is rate-limited per account) must not
  // read as a zero balance: the cards show a dash and the reason is stated.
  const balancesFailed = Boolean(dashboard.balancesError);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {dashboard.me ? `${getGreeting()}, ${dashboard.me.name.split(" ")[0]}` : "Welcome"}
          </h1>
          <p className="mt-1 text-ink-soft">Here&apos;s where your ledger stands.</p>
        </div>
        {/* Scanning a receipt is one of the ways to fill this form in, so it
            is not a second button beside it. */}
        <Link
          href="/expenses/new"
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Add expense
        </Link>
      </header>

      {balancesFailed ? (
        <p
          role="alert"
          className="rounded-2xl border border-neg-600/20 bg-neg-50 px-4 py-3 text-sm font-medium text-neg-700"
        >
          Couldn&apos;t load your balances — {errorMessage(dashboard.balancesError)}
        </p>
      ) : null}

      {/* Balance summary — one row of cards per currency. Currencies are
          separate ledgers: a dollar owed and a euro owed are two facts, and
          adding them would be adding nothing to nothing. */}
      {dashboard.totals.map((total) => {
        const netCents = total.owedToYouCents - total.youOweCents;
        return (
          <section key={total.currency} className="space-y-2">
            {dashboard.totals.length > 1 ? (
              <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
                {total.currency}
              </h2>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard
                label="You are owed"
                value={balancesFailed ? "—" : formatMoney(total.owedToYouCents, total.currency)}
                tone="pos"
              />
              <SummaryCard
                label="You owe"
                value={balancesFailed ? "—" : formatMoney(total.youOweCents, total.currency)}
                tone="neg"
              />
              <SummaryCard
                label="Net balance"
                value={
                  balancesFailed
                    ? "—"
                    : `${netCents < 0 ? "−" : ""}${formatMoney(Math.abs(netCents), total.currency)}`
                }
                tone={netCents >= 0 ? "pos" : "neg"}
                strong
              />
            </div>
          </section>
        );
      })}

      {/* Per-person balances */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">People</h2>
        {balancesFailed ? null : dashboard.balances && dashboard.balances.counterparties.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {dashboard.balances.counterparties.map((counterparty) => {
              if (!counterparty.user) return null;
              // One line per currency. A server predating `balances` sends
              // only the default-currency scalar, which reads the same way.
              const buckets = outstandingBuckets(
                counterparty.balances.length > 0
                  ? counterparty.balances
                  : [{ currency, cents: counterparty.netCents }],
                currency,
              );
              const owedByYou = buckets.filter((bucket) => bucket.cents < 0);
              const toSettle = leadingBucket(owedByYou);
              const person = counterparty.user;
              return (
                <li key={person.id} className="flex items-center gap-3 px-4 py-3">
                  <PersonLink
                    userId={person.id}
                    meId={dashboard.me?.id}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Avatar user={person} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{person.name}</span>
                      <span className="block text-xs text-ink-soft">
                        {buckets.length === 0
                          ? "settled up"
                          : buckets.every((bucket) => bucket.cents > 0)
                            ? "owes you"
                            : buckets.every((bucket) => bucket.cents < 0)
                              ? "you owe"
                              : "owes you · you owe"}
                      </span>
                    </span>
                  </PersonLink>
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
                  {toSettle ? (
                    <button
                      type="button"
                      onClick={() =>
                        dashboard.setSettleWith({
                          user: person,
                          currency: toSettle.currency,
                          cents: toSettle.cents,
                        })
                      }
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-pos-600 hover:text-pos-600"
                    >
                      Settle
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Wallet />}
            title="No balances yet"
            hint="Add an expense with a friend or create a group to get started."
            action={
              <Link
                href="/groups"
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Create a group
              </Link>
            }
          />
        )}
      </section>

      {/* Groups — the other half of "who do I owe": People answers it per
          person, this answers it per shared pot. Compact rows rather than the
          cards the groups page uses, because here it sits between two other
          lists and has to read as a peer of them, not as that page inlined. */}
      {dashboard.topGroups.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Groups</h2>
            {dashboard.groups.length > dashboard.topGroups.length ? (
              <Link href="/groups" className="text-sm font-medium text-brand-600">
                See all {dashboard.groups.length}
              </Link>
            ) : null}
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {dashboard.topGroups.map((summary) =>
              summary.group ? (
                <li key={summary.group.id}>
                  <Link
                    href={`/groups/${summary.group.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-paper"
                  >
                    <span className="text-2xl">{groupEmoji(summary.group.type)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{summary.group.name}</p>
                      <p className="text-xs text-ink-soft">
                        {summary.memberCount} member{summary.memberCount === 1 ? "" : "s"}
                        {summary.yourNetCents === 0
                          ? " · settled up"
                          : summary.yourNetCents > 0
                            ? " · owed to you"
                            : " · you owe"}
                      </p>
                    </div>
                    {/* The group's own currency, not yours — a group settles in
                        one currency and showing your default here would label
                        the number with money it was never counted in. */}
                    {summary.yourNetCents === 0 ? null : (
                      <Money
                        cents={summary.yourNetCents}
                        currency={summary.group.currency}
                        signed
                        className="font-semibold"
                      />
                    )}
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      {/* Recent activity */}
      {dashboard.recentActivity.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent activity</h2>
            <Link href="/activity" className="text-sm font-medium text-brand-600">
              See all
            </Link>
          </div>
          <ul className="space-y-2">
            {dashboard.recentActivity.map((event) => (
              <li key={event.id}>
                <Link
                  href={safeActivityPath(event.link)}
                  className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm hover:border-brand-200"
                >
                  {event.actor ? <Avatar user={event.actor} size="sm" /> : null}
                  <span className="min-w-0 flex-1 truncate">{event.message}</span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {localDate(event.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dashboard.settleWith ? (
        <SettleUpModal
          to={dashboard.settleWith.user}
          received={dashboard.settleWith.cents > 0}
          suggestedCents={Math.abs(dashboard.settleWith.cents)}
          currency={dashboard.settleWith.currency}
          onClose={() => dashboard.setSettleWith(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Renders one balance-summary stat card with a label and a formatted amount.
 *
 * @param props - Component props.
 * @returns A single summary card.
 */
function SummaryCard({
  label,
  value,
  tone,
  strong = false,
}: {
  /** Caption shown above the amount (e.g. "You are owed"). */
  label: string;
  /** Pre-formatted money string to display. */
  value: string;
  /** Color treatment: "pos" for money owed to you, "neg" for money you owe. */
  tone: "pos" | "neg";
  /** When true, tints the card background to emphasize it (used for net balance). */
  strong?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-line p-4 ${
        strong ? (tone === "pos" ? "bg-pos-50" : "bg-neg-50") : "bg-card"
      }`}
    >
      <p className="text-sm text-ink-soft">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          tone === "pos" ? "text-pos-600" : "text-neg-600"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
