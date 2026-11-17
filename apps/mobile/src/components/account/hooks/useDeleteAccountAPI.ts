/** Account deletion RPC and local session/cache erasure after confirmed server success. */

import { readDeletionBalanceReview } from "@haalkhata/shared/account/deletionBalances";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { authClient, expenseClient, errorMessage } from "@/lib/api/connect";
import { clearSession } from "@/lib/api/session";
import { clearMobileQueryCache } from "@/lib/api/queryCache";
import { clearPushTraces } from "@/lib/push/pushStore";

/**
 * Deletes the current account and clears private local state only after commit.
 * @param open Whether the sheet is open and should fetch a fresh balance review.
 * @returns Destructive action, pending state, readable error and reset action.
 */
export function useDeleteAccountAPI(open: boolean) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const committed = useRef(false);
  const [deletedOnServer, setDeletedOnServer] = useState(false);
  const balances = useQuery({
    queryKey: queryKeys.overallBalances,
    queryFn: ({ signal }) => expenseClient.getOverallBalances({}, { signal }),
    enabled: open && !deletedOnServer,
    staleTime: 0,
    retry: false,
  });
  const deletion = useMutation({
    mutationFn: async (confirmation: string) => {
      if (!committed.current) {
        await authClient.deleteAccount({ confirmation });
        committed.current = true;
        setDeletedOnServer(true);
        await queryClient.cancelQueries({ queryKey: queryKeys.overallBalances, exact: true });
      }
      await clearPushTraces();
      await clearSession();
      await clearMobileQueryCache();
    },
    onSuccess: () => router.replace("/login"),
  });
  return { remove: deletion.mutate, isPending: deletion.isPending,
    error: deletion.error ? `${deletedOnServer ? "Your account was deleted. " : ""}${errorMessage(deletion.error)}` : "",
    deletedOnServer, reset: deletion.reset,
    balanceReview: readDeletionBalanceReview({ totals: balances.data?.totals,
      loading: !balances.isPaused && (balances.isPending || balances.isFetching), failed: balances.isError || balances.isPaused }),
    retryBalances: () => { void balances.refetch(); },
    reviewBalances: () => router.push("/dashboard"),
  };
}
