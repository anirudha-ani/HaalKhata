"use client";
/** Dashboard page: balance summary, per-person balances with settle-up, recent activity. */

import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Spinner } from "@/components/ui/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { formatMoney } from "@haalkhata/shared/money/money";
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

      {/* Balance summary */}
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="You are owed"
          value={formatMoney(dashboard.balances?.owedToYouCents ?? 0, currency)}
          tone="pos"
        />
        <SummaryCard
          label="You owe"
          value={formatMoney(dashboard.balances?.youOweCents ?? 0, currency)}
          tone="neg"
        />
        <SummaryCard
          label="Net balance"
          value={`${dashboard.netCents < 0 ? "−" : ""}${formatMoney(Math.abs(dashboard.netCents), currency)}`}
          tone={dashboard.netCents >= 0 ? "pos" : "neg"}
          strong
        />
      </section>

      {/* Per-person balances */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">People</h2>
        {dashboard.balances && dashboard.balances.counterparties.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {dashboard.balances.counterparties.map((counterparty) =>
              counterparty.user ? (
                <li key={counterparty.user.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar user={counterparty.user} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{counterparty.user.name}</p>
                    <p className="text-xs text-ink-soft">
                      {counterparty.netCents === 0
                        ? "settled up"
                        : counterparty.netCents > 0
                          ? "owes you"
                          : "you owe"}
                    </p>
                  </div>
                  <Money
                    cents={counterparty.netCents}
                    currency={currency}
                    signed
                    className="font-semibold"
                  />
                  {counterparty.netCents < 0 ? (
                    <button
                      type="button"
                      onClick={() => dashboard.setSettleWith(counterparty)}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-pos-600 hover:text-pos-600"
                    >
                      Settle
                    </button>
                  ) : null}
                </li>
              ) : null,
            )}
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
                  href={event.link || "/activity"}
                  className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm hover:border-brand-200"
                >
                  {event.actor ? <Avatar user={event.actor} size="sm" /> : null}
                  <span className="min-w-0 flex-1 truncate">{event.message}</span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {event.createdAt.slice(0, 10)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dashboard.settleWith?.user ? (
        <SettleUpModal
          to={dashboard.settleWith.user}
          suggestedCents={-dashboard.settleWith.netCents}
          currency={currency}
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
