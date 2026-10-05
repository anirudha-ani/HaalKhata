/** Account deletion RPC and local session/cache erasure after confirmed server success. */

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { authClient, errorMessage } from "@/lib/api/connect";
import { clearSession } from "@/lib/api/session";
import { clearMobileQueryCache } from "@/lib/api/queryCache";

/**
 * Deletes the current account and clears private local state only after commit.
 * @returns Destructive action, pending state, readable error and reset action.
 */
export function useDeleteAccountAPI() {
  const router = useRouter();
  const deletion = useMutation({
    mutationFn: (confirmation: string) => authClient.deleteAccount({ confirmation }),
    onSuccess: async () => { await clearSession(); await clearMobileQueryCache(); router.replace("/login"); },
  });
  return { remove: deletion.mutate, isPending: deletion.isPending,
    error: deletion.error ? errorMessage(deletion.error) : "", reset: deletion.reset };
}
