/** Reads public provider availability; absent or unreachable configuration hides optional controls. */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { authClient } from "@/lib/api/connect";

/** @returns Current server availability without treating missing credentials as a login error. */
export function useSignInOptionsAPI() {
  return useQuery({ queryKey: queryKeys.signInOptions, queryFn: () => authClient.getSignInOptions({}), retry: false });
}
