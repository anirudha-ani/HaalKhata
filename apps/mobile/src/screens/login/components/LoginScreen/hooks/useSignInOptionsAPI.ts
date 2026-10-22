/** Reads provider availability from the selected backend, keeping credentials off the device. */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { authClient } from "@/lib/api/connect";

/** @returns Server availability; unknown or failed reads keep optional sign-in controls hidden. */
export function useSignInOptionsAPI() {
  return useQuery({ queryKey: queryKeys.signInOptions, queryFn: () => authClient.getSignInOptions({}), retry: false });
}
