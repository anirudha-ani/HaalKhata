/** A live split's screen state: the bill with this person's taps already on it, sent one at a time. */

import { useEffect, useMemo, useRef, useState } from "react";
import { LIVE_SPLIT_CLOCK_INTERVAL_MS } from "@haalkhata/shared/expense/live/live.constants";
import { livePayers, liveSummary, liveTimeLeft, type LiveEdit } from "@haalkhata/shared/expense/live/liveEdits";
import { expenseStateOf } from "@haalkhata/shared/expense/merge/expenseState";
import { errorMessage } from "@/lib/api/connect";
import { useLiveSplitAPI } from "./useLiveSplitAPI";

/**
 * Holds what a live split's screen shows. A tap shows at once and goes to the
 * server in order, each on top of the one before: a person ticking five lines
 * in three seconds must not race themselves. Anything that fails is said on
 * screen and the bill goes back to what is saved.
 *
 * @param expenseId - The expense.
 * @returns The expense, the bill as shown (`state`), the people on it, the
 *   clock, this person's summary, what they may do, and the actions.
 */
export function useLiveSplit(expenseId: string) {
  const liveAPI = useLiveSplitAPI(expenseId);
  const [pending, setPending] = useState<LiveEdit[]>([]);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [settlingWith, setSettlingWith] = useState("");
  const [sharing, setSharing] = useState(false);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), LIVE_SPLIT_CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const expense = liveAPI.detail?.expense;
  const liveSplit = liveAPI.detail?.liveSplit;
  const state = useMemo(
    () => (expense ? pending.reduce((current, edit) => edit(current), expenseStateOf(expense)) : null),
    [expense, pending],
  );
  const timeLeft = liveSplit ? liveTimeLeft(liveSplit.endsAt, clock) : "";
  const isOpen = timeLeft !== "" && expense?.deletedAt === "";

  /**
   * Shows a tap at once and queues it for the server.
   *
   * @param edit - The change.
   */
  const apply = (edit: LiveEdit) => {
    if (!state) return;
    try {
      edit(state);
    } catch (refusal) {
      setError(errorMessage(refusal));
      return;
    }
    setError("");
    setPending((queued) => [...queued, edit]);
    queue.current = queue.current.then(async () => {
      try {
        await liveAPI.saveEdit(edit);
      } catch (failure) {
        setError(errorMessage(failure));
      }
      setPending((queued) => queued.slice(1));
    });
  };

  const people = new Map((liveAPI.detail?.users ?? []).map((user) => [user.id, user]));
  const peopleIds = liveSplit?.peopleIds ?? [];
  // Everybody on the bill, whether they joined or were on it already.
  const castIds = [...new Set([...peopleIds, ...(state ? Object.keys(state.owed) : [])])];
  const meId = liveAPI.me?.id ?? "";

  return {
    expense,
    state,
    liveSplit,
    isOpen,
    timeLeft,
    people,
    castIds,
    meId,
    isHost: liveSplit?.hostId === meId,
    summary: state ? liveSummary(state, meId) : null,
    /** Where this person stands by the balance. */
    standing: {
      settledForViewer: liveAPI.detail?.settledForViewer ?? false,
      owedUserIds: liveAPI.owedUserIds,
    },
    isLoading: liveAPI.isLoading,
    accessEnded: liveAPI.accessEnded,
    readError: liveAPI.readError,
    reload: liveAPI.reload,
    error,
    dismissError: () => setError(""),
    apply,
    finish: () => liveAPI.finish.mutate(undefined, { onError: (failure) => setError(errorMessage(failure)) }),
    isFinishing: liveAPI.finish.isPending,
    /** Who the settle dialog is open for; "" when it is closed. */
    settlingWith,
    openSettle: (payerId: string) => {
      liveAPI.markBalancesStale();
      setSettlingWith(payerId);
    },
    closeSettle: () => setSettlingWith(""),
    /**
     * What this person owes somebody for this bill.
     *
     * @param payerId - Who paid.
     * @returns The cents.
     */
    owedTo: (payerId: string) =>
      (state ? livePayers(state, meId) : []).find((payer) => payer.userId === payerId)?.owedCents ?? 0,
    /**
     * What to call somebody here.
     *
     * @param userId - Who.
     * @returns "You", or their first name.
     */
    nameOf: (userId: string) => (userId === meId ? "You" : (people.get(userId)?.name.split(" ")[0] ?? "Someone")),
    sharing,
    setSharing,
    myName: liveAPI.me?.name ?? "A friend",
  };
}

/** What the live split's page and its parts read. */
export type LiveSplitController = ReturnType<typeof useLiveSplit>;
