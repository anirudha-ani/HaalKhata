"use client";
/** Permanent deletion RPC and browser cache cleanup after the server clears its session cookie. */

import { readDeletionBalanceReview } from "@haalkhata/shared/account/deletionBalances";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authClient, expenseClient, errorMessage } from "@/lib/api/connect";

/**
 * Deletes only the authenticated account and redirects after successful erasure.
 * @param open Whether the dialog is open and should fetch a fresh balance review.
 * @returns Destructive action, readable failures, pending state and reset action.
 */
export function useDeleteAccountAPI(open: boolean) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const balances = useQuery({
    queryKey: queryKeys.overallBalances,
    queryFn: ({ signal }) => expenseClient.getOverallBalances({}, { signal }),
    enabled: open,
    staleTime: 0,
    retry: false,
  });
  const deletion = useMutation({ mutationFn: (confirmation: string) => authClient.deleteAccount({ confirmation }),
    onSuccess: () => { queryClient.clear(); router.replace("/login"); router.refresh(); } });
  return { remove: deletion.mutate, isPending: deletion.isPending,
    error: deletion.error ? errorMessage(deletion.error) : "", reset: deletion.reset,
    balanceReview: readDeletionBalanceReview({ totals: balances.data?.totals,
      loading: !balances.isPaused && (balances.isPending || balances.isFetching), failed: balances.isError || balances.isPaused }),
    retryBalances: () => { void balances.refetch(); },
    reviewBalances: () => router.push("/dashboard"),
  };
}
