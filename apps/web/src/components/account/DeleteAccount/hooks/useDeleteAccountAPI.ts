"use client";
/** Permanent deletion RPC and browser cache cleanup after the server clears its session cookie. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authClient, errorMessage } from "@/lib/api/connect";

/**
 * Deletes only the authenticated account and redirects after successful erasure.
 * @returns Destructive action, readable failures, pending state and reset action.
 */
export function useDeleteAccountAPI() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const deletion = useMutation({ mutationFn: (confirmation: string) => authClient.deleteAccount({ confirmation }),
    onSuccess: () => { queryClient.clear(); router.replace("/login"); router.refresh(); } });
  return { remove: deletion.mutate, isPending: deletion.isPending,
    error: deletion.error ? errorMessage(deletion.error) : "", reset: deletion.reset };
}
