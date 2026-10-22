"use client";
/** Safety RPC hooks; user interface components never call the transport directly. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { safetyClient } from "@/lib/api/connect";

/**
 * Loads caller-owned blocks and invalidates visible content after a mutation.
 * @returns Safety queries and mutations.
 */
export function useSafetyAPI() {
  const queryClient = useQueryClient();
  const blocks = useQuery({ queryKey: queryKeys.blockedUsers, queryFn: () => safetyClient.listBlockedUsers({}) });
  const refresh = () => queryClient.invalidateQueries();
  const report = useMutation({ mutationFn: (input: { targetKind: string; targetId: string; reason: string }) => safetyClient.reportContent(input) });
  const block = useMutation({ mutationFn: (userId: string) => safetyClient.blockUser({ userId }), onSuccess: refresh });
  const unblock = useMutation({ mutationFn: (userId: string) => safetyClient.unblockUser({ userId }), onSuccess: refresh });
  return { blocks, report, block, unblock };
}
