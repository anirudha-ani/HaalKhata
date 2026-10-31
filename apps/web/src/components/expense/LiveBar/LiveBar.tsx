"use client";
/** A live split in one strip: who is here, who has saved, and how to bring in more. */

import { Radio, Share2 } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { GetExpenseResponse } from "@haalkhata/shared/api/plainMessages";
import {
  LIVE_INVITE_EXPLAINER,
  LIVE_INVITE_TITLE,
  liveSavedCount,
} from "@haalkhata/shared/expense/live/live.constants";
import { InviteShareModal } from "@/components/modals/InviteShareModal/InviteShareModal";
import { ErrorAlert } from "@/components/ui/ErrorAlert/ErrorAlert";
import { shareLiveSplit } from "@/lib/invite/share";
import { LiveAvatar } from "./components/LiveAvatar/LiveAvatar";
import { useLiveBar } from "./hooks/useLiveBar";

/**
 * Sits at the top of a bill while it is open to the table, on the form and on
 * its page alike, so everyone sees the same people in the same states.
 *
 * @param props - Component props.
 * @param props.expenseId - The expense.
 * @param props.description - What it is called, for the invite's wording.
 * @param props.liveSplit - The split running on it.
 * @param props.users - Everyone it names.
 * @param props.meId - Who is looking.
 * @param props.startSharing - Whether the invite opens by itself.
 * @returns The liveBar.
 */
export function LiveBar({
  expenseId,
  description,
  liveSplit,
  users,
  meId,
  startSharing = false,
}: {
  expenseId: string;
  description: string;
  liveSplit: NonNullable<GetExpenseResponse["liveSplit"]>;
  users: readonly User[];
  meId: string;
  startSharing?: boolean;
}) {
  const liveBar = useLiveBar(expenseId, liveSplit, startSharing);
  const savedIds = new Set(liveSplit.savedIds);
  const people = liveSplit.peopleIds.flatMap((userId) => users.filter((user) => user.id === userId));
  const myName = users.find((user) => user.id === meId)?.name ?? "";

  return (
    <section aria-label="Live split" className="space-y-2 rounded-2xl border border-brand-200 bg-brand-50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
          <Radio className="h-4 w-4" /> Live{liveBar.timeLeft ? ` · ${liveBar.timeLeft}` : ""}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {people.map((person) => (
            <LiveAvatar key={person.id} user={person} saved={savedIds.has(person.id)} />
          ))}
          <span className="text-xs text-ink-soft">{liveSavedCount(savedIds.size, people.length)}</span>
        </div>
        <button
          type="button"
          onClick={() => liveBar.setSharing(true)}
          className="flex min-h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Share2 className="h-4 w-4" /> Invite
        </button>
        {liveSplit.hostId === meId ? (
          <button
            type="button"
            disabled={liveBar.isFinishing}
            onClick={liveBar.finish}
            className="min-h-10 rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-ink-soft hover:border-brand-200 disabled:opacity-50"
          >
            {liveBar.isFinishing ? "Finishing…" : "Finish now"}
          </button>
        ) : null}
      </div>
      {liveBar.error ? <ErrorAlert message={liveBar.error} /> : null}
      {liveBar.sharing ? (
        <InviteShareModal
          explainer={LIVE_INVITE_EXPLAINER}
          onClose={() => liveBar.setSharing(false)}
          share={() => shareLiveSplit(liveSplit.token, myName, description)}
          title={LIVE_INVITE_TITLE}
          token={liveSplit.token}
        />
      ) : null}
    </section>
  );
}
