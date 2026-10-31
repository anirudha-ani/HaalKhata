"use client";
/** Friend ledger data: the shared history, page by page, plus the settle-up modal's direction. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { errorMessage, expenseClient, socialClient } from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { STATEMENT_PAGE_SIZE, STATEMENT_RELOADED_NOTICE } from "@haalkhata/shared/api/paging";
import {
  firstStatementPage,
  statementEntries,
  type StatementPage,
} from "@haalkhata/shared/expense/pages";
import type { SafetyDialogMode } from "@haalkhata/shared/safety/safety";
import { useSafetyAPI } from "@/lib/hooks/useSafetyAPI";
import { isStatementChanged } from "../utils/statementChanged";

/** Which way a settlement being recorded moved the money. */
export type SettleDirection = "paid" | "received";

/** The settle-up modal's opening state: direction, currency, and how much it covers. */
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
 * Loads the shared history with one person, a page at a time, and holds the
 * settle-up modal's open/direction state.
 *
 * The statement is one infinite query: its first page is GetFriendLedger
 * (the headline, the balances, the newest lines) and each later page is
 * ListFriendLedgerEntries, continuing the running balance from the cursor.
 * A refetch reads every loaded page again in order, each from a fresh
 * cursor, so the lines shown always come from one reading of the history.
 * When a later page is refused because a line changed since the first was
 * read, that refetch is what runs, and the page says so.
 *
 * @param friendId - User id of the person whose ledger to load.
 * @returns The `ledger` response (or undefined while loading), `entries`
 *   (every loaded line, newest first) with `hasMoreEntries`/`loadMoreEntries`/
 *   `isLoadingMoreEntries`/`loadMoreError`/`statementNotice`, `isLoading`,
 *   the load `error`, `sendReminder` with its `isReminding` flag and the
 *   resulting `reminderNote`, `removeSettlement` with its arming and in-flight
 *   ids and the `settlementRemovalError` of a refused one, `settling`/`openSettle`/`closeSettle` driving the settle-up modal,
 *   and `safetyMode`/`setSafetyMode` for the report or block dialog the
 *   options menu opens, with `isBlocked` once this person is blocked.
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
  const [reloadingStatement, setReloadingStatement] = useState(false);

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
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    // A page refused because the statement changed would be refused again;
    // the answer is the reload below, so it is not asked twice.
    retry: (failureCount, failure) => !isStatementChanged(failure) && failureCount < 1,
  });
  const ledger = statement.data?.pages[0]?.ledger;
  const statementFailure = statement.error ? errorMessage(statement.error) : "";

  /**
   * Loads the next older page. A refusal because the statement changed is
   * answered by reading every loaded page again, from fresh cursors, with a
   * note beside Show more saying why the lines may have moved.
   */
  const loadMoreEntries = async () => {
    setStatementNotice("");
    const outcome = await statement.fetchNextPage();
    if (isStatementChanged(outcome.error)) {
      setStatementNotice(STATEMENT_RELOADED_NOTICE);
      setReloadingStatement(true);
      try {
        await statement.refetch();
      } finally {
        setReloadingStatement(false);
      }
    }
  };

  // Requesting from this page: the ledger already establishes context, but
  // the other person still has to consent before a friendship is created.
  const addFriend = useMutation({
    mutationFn: () =>
      socialClient.addFriend({ email: "", phone: "", name: "", userId: friendId }),
    onSuccess: () => {
      setFriendRequestSent(true);
      setReminderNote("Friend request sent");
      // The list shows requests waiting for an answer; this page's own figures are unchanged.
      queryClient.invalidateQueries({ queryKey: queryKeys.friends, exact: true });
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
      // friendLedger is a prefix of the statement's key: both are read again.
      queryClient.invalidateQueries({ queryKey: queryKeys.friendLedger(friendId) });
    },
  });

  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  // Ends the friendship (§37). The server holds the settled-balance gate;
  // the page also disables the button while balances are outstanding, so
  // the refusal is normally never seen.
  const removeFriendMutation = useMutation({
    mutationFn: () => socialClient.removeFriend({ userId: friendId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      router.push("/friends");
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

  return {
    ledger,
    entries: statementEntries(statement.data?.pages ?? []),
    hasMoreEntries: statement.hasNextPage,
    isLoadingMoreEntries: statement.isFetchingNextPage || reloadingStatement,
    loadMoreEntries: () => void loadMoreEntries(),
    /** Why the next page did not load; "" when it did, or when the refusal was a change answered by a reload. */
    loadMoreError:
      statement.isFetchNextPageError && !isStatementChanged(statement.error) ? statementFailure : "",
    /** Said beside Show more after the statement was read again because it changed. */
    statementNotice,
    safetyMode,
    setSafetyMode,
    isBlocked: safety.blocks.data?.users.some((person) => person.id === friendId) ?? false,
    confirmingRemoval,
    /** First call arms the confirmation; the second actually removes. */
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
    isLoading: statement.isLoading,
    /**
     * Why reading the statement failed. A failed older page is
     * `loadMoreError` instead, and while a refused page is answered by a
     * reload the refusal is not a failure of the statement: the lines stay
     * on screen until the fresh ones replace them.
     */
    error: reloadingStatement || statement.isFetchNextPageError ? null : statement.error,
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
    /**
     * Removes a mistaken payment in two taps: the first arms the row, the
     * second sends. A modal for a one-line ledger row is heavier than the
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
     * Opens the settle-up modal for one direction in one currency.
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
