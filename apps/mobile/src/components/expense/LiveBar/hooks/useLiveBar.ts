/** What a live split's bar needs: the clock, the invite, and the way to finish early. */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import type { GetExpenseResponse } from "@haalkhata/shared/api/plainMessages";
import { LIVE_SPLIT_CLOCK_INTERVAL_MS } from "@haalkhata/shared/expense/live/live.constants";
import { liveTimeLeft } from "@haalkhata/shared/expense/live/liveTime";
import { errorMessage, expenseClient } from "@/lib/api/connect";

/**
 * Holds a live split's bar.
 *
 * @param expenseId - The expense.
 * @param liveSplit - The split running on it.
 * @param startSharing - Whether the invite opens by itself, as it does for
 *   whoever just started the split.
 * @returns The time left, the invite's state, and finishing.
 */
export function useLiveBar(
  expenseId: string,
  liveSplit: NonNullable<GetExpenseResponse["liveSplit"]>,
  startSharing: boolean,
) {
  const queryClient = useQueryClient();
  const [clock, setClock] = useState(() => Date.now());
  const [sharing, setSharing] = useState(startSharing);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), LIVE_SPLIT_CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const finish = useMutation({
    mutationFn: () => expenseClient.finishLiveSplit({ expenseId }),
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: queryKeys.expense(expenseId) });
      for (const moneyKey of MONEY_KEYS) queryClient.invalidateQueries({ queryKey: moneyKey });
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  return {
    timeLeft: liveTimeLeft(liveSplit.endsAt, clock),
    sharing,
    setSharing,
    finish: () => finish.mutate(),
    isFinishing: finish.isPending,
    error,
  };
}
