"use client";
/** A bill open to the whole table: who is here, every line to claim, and what it comes to. */

import Link from "next/link";
import { Check, Radio, Share2 } from "lucide-react";
import { LIVE_SPLIT_CLOSED_MESSAGE } from "@haalkhata/shared/expense/live/live.constants";
import { AvatarStack } from "@/components/ui/AvatarStack/AvatarStack";
import { ErrorAlert } from "@/components/ui/ErrorAlert/ErrorAlert";
import { ErrorPopup } from "@/components/ui/ErrorPopup/ErrorPopup";
import { Money } from "@/components/ui/Money/Money";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { InviteShareModal } from "@/components/modals/InviteShareModal/InviteShareModal";
import { SettleUpModal } from "@/components/modals/SettleUpModal/SettleUpModal";
import { shareLiveSplit } from "@/lib/invite/share";
import { AddLineForm } from "./components/AddLineForm/AddLineForm";
import { LiveExtras } from "./components/LiveExtras/LiveExtras";
import { LiveLine } from "./components/LiveLine/LiveLine";
import { LiveTotals } from "./components/LiveTotals/LiveTotals";
import { PEOPLE_AVATAR_SLOTS } from "./constants/liveSplitPage";
import { useLiveSplit } from "./hooks/useLiveSplit";

/**
 * Renders a live split. Everything on it updates by itself within a few
 * seconds of anyone changing it; when it ends the page stays as the final
 * bill, with the way to settle it.
 *
 * @param props - Component props.
 * @param props.expenseId - The expense.
 * @returns The page.
 */
export function LiveSplitPage({ expenseId }: { expenseId: string }) {
  const live = useLiveSplit(expenseId);
  const { expense, state, liveSplit, summary } = live;

  if (live.isLoading) return <Spinner label="Loading the bill…" />;
  if (live.accessEnded) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 rounded-2xl border border-line bg-card p-5">
        <p className="text-sm">{LIVE_SPLIT_CLOSED_MESSAGE}</p>
        <Link href="/dashboard" className="text-sm font-semibold text-brand-600">Back to Home</Link>
      </div>
    );
  }
  if (!expense || !state) return <ErrorAlert message="This bill could not be loaded." />;

  const payer = live.people.get(summary?.payerId ?? "");
  const present = live.castIds.flatMap((userId) => {
    const person = live.people.get(userId);
    return person ? [person] : [];
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{expense.description}</h1>
            <Money cents={state.amountCents} currency={expense.currency} className="text-sm text-ink-soft" />
          </div>
          {live.isOpen ? (
            <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <Radio className="h-3.5 w-3.5" /> Live · {live.timeLeft}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-pos-50 px-3 py-1 text-xs font-semibold text-pos-700">
              <Check className="h-3.5 w-3.5" /> Finished
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AvatarStack users={present} slots={PEOPLE_AVATAR_SLOTS} />
          <span className="min-w-0 flex-1 text-sm text-ink-soft">
            {present.length} {present.length === 1 ? "person" : "people"} here
          </span>
          {live.isOpen && liveSplit?.token ? (
            <button
              type="button"
              onClick={() => live.setSharing(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Share2 className="h-4 w-4" /> Invite
            </button>
          ) : null}
          {live.isOpen && live.isHost ? (
            <button
              type="button"
              disabled={live.isFinishing}
              onClick={live.finish}
              className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft hover:border-brand-200 disabled:opacity-50"
            >
              {live.isFinishing ? "Finishing…" : "Finish now"}
            </button>
          ) : null}
        </div>
      </section>

      <LiveTotals live={live} />

      <section className="rounded-2xl border border-line bg-card px-4 py-1">
        <ul className="divide-y divide-line">
          {state.lines.map((line, position) => (
            <LiveLine key={line.id || `new-${position}`} line={line} live={live} />
          ))}
        </ul>
      </section>

      {live.isOpen ? <AddLineForm live={live} /> : null}
      <LiveExtras live={live} />

      <Link href={`/expenses/${expense.id}`} className="block text-center text-sm font-semibold text-brand-600">
        Open the expense
      </Link>

      {live.sharing && liveSplit ? (
        <InviteShareModal
          explainer="Anyone with this link can join, claim what they had and change the bill until it ends."
          onClose={() => live.setSharing(false)}
          share={() => shareLiveSplit(liveSplit.token, live.myName, expense.description)}
          title="Invite the table"
          token={liveSplit.token}
        />
      ) : null}
      {live.settling && payer ? (
        <SettleUpModal
          currency={expense.currency}
          onClose={live.closeSettle}
          scopeId={expense.groupId}
          suggestedCents={summary?.myShareCents ?? 0}
          to={payer}
        />
      ) : null}
      <ErrorPopup message={live.error} onDismiss={live.dismissError} />
    </div>
  );
}
