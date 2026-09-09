/** Transport regressions for authenticated social-operation rate limits. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerContext } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { EmptySchema } from "@bufbuild/protobuf/wkt";

vi.mock("@/server/social/usecase/social.usecase", () => ({ listFriends: vi.fn() }));
vi.mock("@/server/api/connect/context", () => ({
  requireUser: vi.fn(),
  runUsecase: vi.fn((operation: () => Promise<unknown>) => operation()),
}));
vi.mock("@/server/api/connect/rpcRateLimit", () => ({
  RPC_RATE_LIMITS: { getOverallBalances: 60 },
  requireRateLimitedUser: vi.fn().mockResolvedValue("user-123"),
}));

import { requireRateLimitedUser } from "@/server/api/connect/rpcRateLimit";
import { listFriends } from "@/server/social/usecase/social.usecase";
import { socialHandler } from "./handler";

beforeEach(() => vi.clearAllMocks());

describe("social handler rate limits", () => {
  it("charges ListFriends to the full-ledger aggregate bucket", async () => {
    vi.mocked(listFriends).mockResolvedValue({ friends: [], incomingRequests: [], outgoingRequests: [] });
    const context = {} as HandlerContext;

    await socialHandler.listFriends(create(EmptySchema), context);

    expect(requireRateLimitedUser).toHaveBeenCalledWith(
      context,
      "get-overall-balances",
      60,
    );
    expect(listFriends).toHaveBeenCalledWith("user-123");
  });
});
