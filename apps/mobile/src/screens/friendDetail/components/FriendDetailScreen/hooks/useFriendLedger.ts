/** Friend ledger data: the shared history, a page at a time, plus the settle-up sheet's direction. */

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { errorMessage, expenseClient, socialClient } from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { STATEMENT_PAGE_SIZE, STATEMENT_RELOADED_NOTICE } from "@haalkhata/shared/api/paging";
import {
  firstStatementPage,
  statementEntries,
  type StatementPage,
} from "@haalkhata/shared/expense/pages";
import { isStatementChanged } from "../../../utils/statementChanged";
import type { SafetyDialogMode } from "@haalkhata/shared/safety/safety";
import { useSafetyAPI } from "@/components/safety/hooks/useSafetyAPI";
import { usePullToRefresh } from "@/lib/hooks/usePullToRefresh";

/** Which way a settlement being recorded moved the money. */
export type SettleDirection = "paid" | "received";

/** The settle-up sheet's opening state: direction, currency, and how much it covers. */
export interface Settling {
  direction: SettleDirection;
  /** ISO 4217 code of the balance being settled. */
  currency: string;
  /**
   * The one balance being settled: a group's id, or "" for what is not in
   * any group. Undefined settles everything with the person.
   */
  scopeId?: string;
}

/** A payment's removal that was refused, and the line it was for. */
export interface SettlementRemovalError {
  /** The payment line that was tapped. */
  settlementId: string;
  /** The reason, as the server worded it. */
  message: string;
}

/**
 * Loads the shared history with one person a page at a time and holds the
 * settle-up sheet's open/direction state.
 *
 * The statement is one infinite query: its first page is GetFriendLedger
 * (the headline, the balances, the settle position and the newest lines),
 * the rest ListFriendLedgerEntries from each page's cursor. Reading it again
 * re-reads every loaded page in order, each from the cursor the page before
 * it just returned, so the running balances on screen always continue one
 * another.
 *
 * @param friendId - User id of the person whose ledger to load.
 * @returns The `ledger` response (or undefined while loading), every loaded
 *   statement line as `entries`, `isLoading`, the load `error`,
 *   `hasMoreLines`/`isLoadingMoreLines`/`loadMoreLines` with the
 *   `loadMoreError` and `statementNotice` beside that control,
 *   `refresh`/`isRefreshing` for pull-to-refresh,
 *   `addFriend` with `isAddingFriend`/`friendRequestSent`, `sendReminder`
 *   with its `isReminding` flag and the resulting `reminderNote`,
 *   `removeSettlement` with its arming and in-flight ids and the
 *   `settlementRemovalError` of a refused one,
 *   `settling`/`openSettle`/`closeSettle` driving the settle-up sheet, and
 *   `safetyMode`/`setSafetyMode` for the report or block sheet the options
 *   menu opens, with `isBlocked` once this person is blocked.
 */
export function useFriendLedger(friendId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [settling, setSettling] = useState<Settling | null>(null);
  const [safetyMode, setSafetyMode] = useState<SafetyDialogMode | null>(null);
  const safety = useSafetyAPI();
  const [reminderNote, setReminderNote] = useState("");
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [confirmingSettlementId, setConfirmingSettlementId] = useState("");
  const [settlementRemovalError, setSettlementRemovalError] =
    useState<SettlementRemovalError | null>(null);
  const [statementNotice, setStatementNotice] = useState("");
  // True while the statement is read again after a refused older page. The
  // refusal stays the query's error until that read lands, and it is no
  // longer marked as a next-page failure, so without this the screen would
  // briefly take it for a failed first read.
  const [reloadingStatement, setReloadingStatement] = useState(false);

  // friendStatement, not friendLedger: the settle sheet reads the ledger
  // through a plain useQuery, and an infinite query cannot share its entry.
  const statement = useInfiniteQuery({
    queryKey: queryKeys.friendStatement(friendId),
    initialPageParam: "",
    queryFn: async ({ pageParam }): Promise<StatementPage> => {
      if (!pageParam) {
        return firstStatementPage(
          await expenseClient.getFriendLedger({ userId: friendId, limit: STATEMENT_PAGE_SIZE }),
        );
      }
      const older = await expenseClient.listFriendLedgerEntries({
        userId: friendId,
        cursor: pageParam,
        limit: STATEMENT_PAGE_SIZE,
      });
      return { entries: older.entries, nextCursor: older.nextCursor };
    },
    // An empty cursor means the oldest line is loaded.
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    // A changed statement refuses the same cursor every time, so asking
    // again only delays the reload; anything else gets the app's one retry.
    retry: (failureCount, failure) => !isStatementChanged(failure) && failureCount < 1,
  });
  const ledger = statement.data?.pages[0]?.ledger;
  const entries = useMemo(() => statementEntries(statement.data?.pages ?? []), [statement.data]);
  // A failed older page is said beside Show more, with the lines already
  // loaded left in place; only a failed first read takes the screen.
  const loadMoreFailure = statement.isFetchNextPageError ? statement.error : null;
  const pageFailure = loadMoreFailure ?? (reloadingStatement ? statement.error : null);

  // Requesting from this screen: the ledger already establishes context, but
  // the other person still has to consent before a friendship is created.
  const addFriend = useMutation({
    mutationFn: () =>
      socialClient.addFriend({ email: "", phone: "", name: "", userId: friendId }),
    onSuccess: () => {
      setFriendRequestSent(true);
      setReminderNote("Friend request sent");
    },
    onError: (mutationError) => setReminderNote(errorMessage(mutationError)),
  });

  // Removing a payment changes balances everywhere it was counted, so the
  // whole money set is invalidated, not just this ledger.
  const removeSettlementMutation = useMutation({
    mutationFn: (settlementId: string) => expenseClient.deleteSettlement({ settlementId }),
    onSuccess: () => {
      setConfirmingSettlementId("");
      for (const moneyQueryKey of MONEY_KEYS) {
        queryClient.invalidateQueries({ queryKey: moneyQueryKey });
      }
    },
    // The refusal goes on the line that was tapped: the statement can be
    // screens below anything shown at the top. A refusal usually means the
    // line changed under this view (the other person removed it first), so
    // the statement is read again as well.
    onError: (mutationError, settlementId) => {
      setConfirmingSettlementId("");
      setSettlementRemovalError({ settlementId, message: errorMessage(mutationError) });
      queryClient.invalidateQueries({ queryKey: queryKeys.friendLedger(friendId) });
    },
  });

  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  // Ends the friendship (§37). The server holds the settled-balance gate;
  // the screen also disables the button while balances are outstanding, so
  // the refusal is normally never seen.
  const removeFriendMutation = useMutation({
    mutationFn: () => socialClient.removeFriend({ userId: friendId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      router.back();
    },
    onError: (mutationError) => {
      setConfirmingRemoval(false);
      setReminderNote(errorMessage(mutationError));
    },
  });

  const remind = useMutation({
    mutationFn: () => socialClient.sendReminder({ userId: friendId }),
    onSuccess: () => setReminderNote("Reminder sent"),
    // The cooldown and the "they owe you nothing" rule are enforced on the
    // server, so its message is the honest one to show.
    onError: (mutationError) => setReminderNote(errorMessage(mutationError)),
  });

  const pull = usePullToRefresh(() => statement.refetch());

  return {
    ledger,
    entries,
    safetyMode,
    setSafetyMode,
    isBlocked: safety.blocks.data?.users.some((person) => person.id === friendId) ?? false,
    isLoading: statement.isLoading,
    error: reloadingStatement || statement.isFetchNextPageError ? null : statement.error,
    hasMoreLines: statement.hasNextPage,
    isLoadingMoreLines: statement.isFetchingNextPage || reloadingStatement,
    /**
     * Reads the next older page. When the server refuses it because a line
     * changed since the first page was read, every loaded page is read
     * again — the balances shown were worked out from a history that no
     * longer holds — and the screen says so beside the control.
     */
    loadMoreLines: async () => {
      setStatementNotice("");
      const outcome = await statement.fetchNextPage();
      if (outcome.isFetchNextPageError && isStatementChanged(outcome.error)) {
        setStatementNotice(STATEMENT_RELOADED_NOTICE);
        setReloadingStatement(true);
        try {
          await statement.refetch();
        } finally {
          setReloadingStatement(false);
        }
      }
    },
    /** Why the last older page did not load; "" when it did, or when the statement was reloaded instead. */
    loadMoreError:
      pageFailure && !isStatementChanged(pageFailure) ? errorMessage(pageFailure) : "",
    /** Said beside Show more after the statement was read again; "" otherwise. */
    statementNotice,
    refresh: pull.refresh,
    isRefreshing: pull.isRefreshing,
    addFriend: () => {
      setReminderNote("");
      addFriend.mutate();
    },
    isAddingFriend: addFriend.isPending,
    friendRequestSent,
    reminderNote,
    isReminding: remind.isPending,
    sendReminder: () => {
      setReminderNote("");
      remind.mutate();
    },
    confirmingRemoval,
    /** First tap arms the confirmation; the second actually removes. */
    removeFriend: () => {
      setReminderNote("");
      if (!confirmingRemoval) {
        setConfirmingRemoval(true);
        return;
      }
      removeFriendMutation.mutate();
    },
    cancelRemoval: () => setConfirmingRemoval(false),
    isRemovingFriend: removeFriendMutation.isPending,
    /**
     * Removes a mistaken payment in two taps: the first arms the row, the
     * second sends. A sheet for a one-line ledger row is heavier than the
     * mistake it corrects; the second tap is the confirmation.
     *
     * @param settlementId - The payment line being removed.
     */
    removeSettlement: (settlementId: string) => {
      setSettlementRemovalError(null);
      if (confirmingSettlementId !== settlementId) {
        setConfirmingSettlementId(settlementId);
        return;
      }
      removeSettlementMutation.mutate(settlementId);
    },
    confirmingSettlementId,
    settlementRemovalError,
    removingSettlementId: removeSettlementMutation.isPending
      ? removeSettlementMutation.variables
      : undefined,
    settling,
    /**
     * Opens the settle-up sheet for one direction in one currency.
     *
     * @param direction - "paid" when you paid them, "received" when they paid you.
     * @param currency - ISO 4217 code of the balance being settled.
     * @param scopeId - One balance to settle alone (a group id, or "" for what
     *   is not in any group); omitted to settle everything with the person.
     */
    openSettle: (direction: SettleDirection, currency: string, scopeId?: string) =>
      setSettling({ direction, currency, scopeId }),
    closeSettle: () => setSettling(null),
  };
}
