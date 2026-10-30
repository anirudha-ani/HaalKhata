/** A live split's queries and writes: the expense, the timer that notices others' changes, and saving one tap. */

import { useEffect } from "react";
import { Code, ConnectError } from "@connectrpc/connect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MONEY_KEYS, queryKeys } from "@haalkhata/shared/api/queryKeys";
import { COMMENT_PAGE_SIZE } from "@haalkhata/shared/api/paging";
import type { Expense } from "@haalkhata/shared/api/plainMessages";
import { LIVE_SPLIT_CHECK_INTERVAL_MS } from "@haalkhata/shared/expense/live/live.constants";
import { liveEditRequest, withSavedEdit, type LiveEdit } from "@haalkhata/shared/expense/live/liveEdits";
import { expenseStateOf } from "@haalkhata/shared/expense/merge/expenseState";
import { authClient, expenseClient } from "@/lib/api/connect";
import { newOperationId } from "@/lib/api/operationId";

/**
 * Whether a read was refused because this person no longer has anything to
 * see: the split ended and they had claimed nothing.
 *
 * @param failure - The failure, if any.
 * @returns True when access is what ended.
 */
function accessEnded(failure: unknown): boolean {
  return failure instanceof ConnectError && failure.code === Code.PermissionDenied;
}

/**
 * Loads an expense for its live split and keeps it fresh: while the split
 * runs it asks every few seconds whether anything changed, and reads the
 * whole expense again when something did.
 *
 * @param expenseId - The expense.
 * @returns `me`, the expense's `detail`, whether it is loading, whether access
 *   has ended, what reading failed with, `saveEdit`, `finish`, and `markBalancesStale`.
 */
export function useLiveSplitAPI(expenseId: string) {
  const queryClient = useQueryClient();
  const expenseKey = queryKeys.expense(expenseId);
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: () => authClient.getMe({}) });

  /** @returns The expense as it is saved now. */
  const readExpense = () => expenseClient.getExpense({ expenseId, commentLimit: COMMENT_PAGE_SIZE });
  const detailQuery = useQuery({ queryKey: expenseKey, queryFn: readExpense, retry: false });
  const running = detailQuery.data?.liveSplit !== undefined;
  const versionQuery = useQuery({
    queryKey: queryKeys.expenseVersion(expenseId),
    queryFn: () => expenseClient.getExpenseVersion({ expenseId }),
    enabled: running,
    refetchInterval: LIVE_SPLIT_CHECK_INTERVAL_MS,
    retry: false,
  });

  const heldVersion = detailQuery.data?.expense?.version;
  const savedVersion = versionQuery.data?.version;
  useEffect(() => {
    if (heldVersion === undefined || savedVersion === undefined || savedVersion <= heldVersion) return;
    void queryClient.invalidateQueries({ queryKey: expenseKey });
    // The key is a new array each render; the id is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, heldVersion, savedVersion, queryClient]);

  /** Marks every figure stale, so whatever is opened next reads what this split did. */
  const markBalancesStale = () => {
    for (const moneyKey of MONEY_KEYS) void queryClient.invalidateQueries({ queryKey: moneyKey });
  };

  /**
   * Saves one tap on top of the expense as this device last saw it. Two
   * people changing the same thing a moment apart is answered by applying the
   * tap to what is saved now: everyone is looking at the same bill, and it
   * shows the result within seconds.
   *
   * @param edit - The change.
   */
  const saveEdit = async (edit: LiveEdit) => {
    /**
     * Sends the tap against one version of the expense.
     *
     * @param latest - That version.
     * @returns The saved expense.
     */
    const send = (latest: Expense) =>
      expenseClient.updateExpense({
        expenseId,
        expense: liveEditRequest(latest, edit(expenseStateOf(latest)), newOperationId()),
        base: latest,
      });
    const held = queryClient.getQueryData<Awaited<ReturnType<typeof readExpense>>>(expenseKey)?.expense;
    if (!held) return;
    let saved: Expense;
    try {
      saved = await send(held);
    } catch (failure) {
      if (!(failure instanceof ConnectError) || failure.code !== Code.Aborted) throw failure;
      const fresh = await queryClient.fetchQuery({ queryKey: expenseKey, queryFn: readExpense, staleTime: 0 });
      if (!fresh.expense) return;
      saved = await send(fresh.expense);
    }
    queryClient.setQueryData<Awaited<ReturnType<typeof readExpense>>>(expenseKey, (current) => withSavedEdit(current, saved));
    void queryClient.invalidateQueries({ queryKey: expenseKey });
  };

  const finish = useMutation({
    mutationFn: () => expenseClient.finishLiveSplit({ expenseId }),
    onSuccess: () => {
      markBalancesStale();
      void queryClient.invalidateQueries({ queryKey: expenseKey });
    },
  });

  return {
    me: meQuery.data,
    detail: detailQuery.data,
    isLoading: detailQuery.isLoading || meQuery.isLoading,
    accessEnded: accessEnded(detailQuery.error) || accessEnded(versionQuery.error),
    readError: detailQuery.data ? null : detailQuery.error,
    reload: () => void detailQuery.refetch(),
    saveEdit,
    finish,
    markBalancesStale,
  };
}
