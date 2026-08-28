"use client";
/** Friend ledger data: the shared history query plus the settle-up modal's direction. */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { errorMessage, expenseClient, socialClient } from "@/lib/api/connect";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";

/** Which way a settlement being recorded moved the money. */
export type SettleDirection = "paid" | "received";

/**
 * Loads the full shared history with one person and holds the settle-up
 * modal's open/direction state.
 *
 * @param friendId - User id of the person whose ledger to load.
 * @returns The `ledger` response (or undefined while loading), `isLoading`,
 *   the load `error`, `sendReminder` with its `isReminding` flag and the
 *   resulting `reminderNote`, and `settling`/`openSettle`/`closeSettle`
 *   driving the settle-up modal.
 */
export function useFriendLedger(friendId: string) {
  const [settling, setSettling] = useState<SettleDirection | null>(null);
  const [reminderNote, setReminderNote] = useState("");
  const [friendRequestSent, setFriendRequestSent] = useState(false);

  const ledger = useQuery({
    queryKey: queryKeys.friendLedger(friendId),
    queryFn: () => expenseClient.getFriendLedger({ userId: friendId }),
  });

  // Requesting from this page: the ledger already establishes context, but
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
    settling,
    /**
     * Opens the settle-up modal for one direction.
     *
     * @param direction - "paid" when you paid them, "received" when they paid you.
     */
    openSettle: (direction: SettleDirection) => setSettling(direction),
    closeSettle: () => setSettling(null),
  };
}
