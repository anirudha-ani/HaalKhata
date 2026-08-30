/** Friend ledger data: the shared history query plus the settle-up sheet's direction. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage, expenseClient, socialClient } from "@/lib/api/connect";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";

/** Which way a settlement being recorded moved the money. */
export type SettleDirection = "paid" | "received";

/** The settle-up sheet's opening state: direction and currency. */
export interface Settling {
  direction: SettleDirection;
  /** ISO 4217 code of the balance being settled. */
  currency: string;
}

/**
 * Loads the full shared history with one person and holds the settle-up
 * sheet's open/direction state.
 *
 * @param friendId - User id of the person whose ledger to load.
 * @returns The `ledger` response (or undefined while loading), `isLoading`,
 *   the load `error`, `refresh`/`isRefreshing` for pull-to-refresh,
 *   `addFriend` with `isAddingFriend`/`friendRequestSent`, `sendReminder`
 *   with its `isReminding` flag and the resulting `reminderNote`,
 *   `removeSettlement` with its arming and in-flight ids, and
 *   `settling`/`openSettle`/`closeSettle` driving the settle-up sheet.
 */
export function useFriendLedger(friendId: string) {
  const queryClient = useQueryClient();
  const [settling, setSettling] = useState<Settling | null>(null);
  const [reminderNote, setReminderNote] = useState("");
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [confirmingSettlementId, setConfirmingSettlementId] = useState("");

  const ledger = useQuery({
    queryKey: queryKeys.friendLedger(friendId),
    queryFn: () => expenseClient.getFriendLedger({ userId: friendId }),
  });

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
    onError: (mutationError) => setReminderNote(errorMessage(mutationError)),
  });

  const remind = useMutation({
    mutationFn: () => socialClient.sendReminder({ userId: friendId }),
    onSuccess: () => setReminderNote("Reminder sent"),
    // The cooldown and the "they owe you nothing" rule are enforced on the
    // server, so its message is the honest one to show.
    onError: (mutationError) => setReminderNote(errorMessage(mutationError)),
  });

  return {
    ledger: ledger.data,
    isLoading: ledger.isLoading,
    error: ledger.error,
    refresh: () => void ledger.refetch(),
    isRefreshing: ledger.isRefetching,
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
     * second sends. A sheet for a one-line ledger row is heavier than the
     * mistake it corrects; the second tap is the confirmation.
     *
     * @param settlementId - The payment line being removed.
     */
    removeSettlement: (settlementId: string) => {
      if (confirmingSettlementId !== settlementId) {
        setConfirmingSettlementId(settlementId);
        return;
      }
      setReminderNote("");
      removeSettlementMutation.mutate(settlementId);
    },
    confirmingSettlementId,
    removingSettlementId: removeSettlementMutation.isPending
      ? removeSettlementMutation.variables
      : undefined,
    settling,
    /**
     * Opens the settle-up sheet for one direction in one currency.
     *
     * @param direction - "paid" when you paid them, "received" when they paid you.
     * @param currency - ISO 4217 code of the balance being settled.
     */
    openSettle: (direction: SettleDirection, currency: string) =>
      setSettling({ direction, currency }),
    closeSettle: () => setSettling(null),
  };
}
