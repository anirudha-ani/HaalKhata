/** Tests that an ended admin session leaves nothing behind in the query cache, including its own error. */

import { Code, ConnectError } from "@connectrpc/connect";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@haalkhata/shared/api/queryKeys";
import { forgetUsageOverview } from "./forgetUsageOverview";
import { isSessionEnded } from "./isSessionEnded";

/**
 * Puts the cache in the state an expired session leaves it in: the overview
 * loaded once, then a refresh was refused.
 *
 * @returns A client whose overview query holds both data and the refusal.
 */
async function clientAfterSessionExpired(): Promise<QueryClient> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await queryClient.fetchQuery({
    queryKey: queryKeys.adminUsage,
    queryFn: () => Promise.resolve({ totals: { registeredUserCount: 6 } }),
  });
  await queryClient
    .fetchQuery({
      queryKey: queryKeys.adminUsage,
      queryFn: () => Promise.reject(new ConnectError("sign in to continue", Code.Unauthenticated)),
      staleTime: 0,
    })
    .catch(() => undefined);
  return queryClient;
}

/**
 * What a freshly mounted dashboard would read from the cache before its own
 * request has answered.
 *
 * @param queryClient - The client to observe.
 * @returns The first result a new observer gets.
 */
function firstReadOnMount(queryClient: QueryClient) {
  const observer = new QueryObserver(queryClient, {
    queryKey: queryKeys.adminUsage,
    // Never settles: this is the moment between mounting and the answer.
    queryFn: () => new Promise<never>(() => undefined),
  });
  const unsubscribe = observer.subscribe(() => undefined);
  const result = observer.getCurrentResult();
  unsubscribe();
  return result;
}

describe("forgetUsageOverview", () => {
  it("is needed: without it the next dashboard reads the old session's refusal", async () => {
    const queryClient = await clientAfterSessionExpired();

    const result = firstReadOnMount(queryClient);

    // The stale error is what would bounce a newly signed-in operator back out.
    expect(isSessionEnded(result.error)).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("leaves the next dashboard nothing to read: no refusal and no figures", async () => {
    const queryClient = await clientAfterSessionExpired();

    forgetUsageOverview(queryClient);

    expect(queryClient.getQueryState(queryKeys.adminUsage)).toBeUndefined();
    const result = firstReadOnMount(queryClient);
    expect(result.error).toBeNull();
    expect(result.data).toBeUndefined();
    expect(result.isLoading).toBe(true);
  });

  it("does not touch anything else in the cache", async () => {
    const queryClient = await clientAfterSessionExpired();
    queryClient.setQueryData(["unrelated"], "kept");

    forgetUsageOverview(queryClient);

    expect(queryClient.getQueryData(["unrelated"])).toBe("kept");
  });
});
