/** Contact-discovery RPC hook; screens never call the transport directly. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { authClient } from "@/lib/api/connect";

/**
 * Saves whether people can find the caller from their contacts. The reply
 * is the caller's own profile, written straight into the `me` cache so every
 * screen reading the answer (Account, Friends, Find friends, onboarding)
 * agrees at once.
 *
 * @returns The `setDiscoverable` mutation; callers report its failures.
 */
export function useContactDiscoveryAPI() {
  const queryClient = useQueryClient();
  const setDiscoverable = useMutation({
    mutationFn: (discoverable: boolean) => authClient.setContactDiscovery({ discoverable }),
    onSuccess: (profile) => queryClient.setQueryData(queryKeys.me, profile),
  });
  return { setDiscoverable };
}
