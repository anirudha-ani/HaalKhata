/** Transport regressions for authenticated social-operation rate limits. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerContext } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { EmptySchema } from "@bufbuild/protobuf/wkt";
import {
  FindContactsRequestSchema,
  SendFriendRequestsRequestSchema,
} from "@haalkhata/protogen/social/v1/social_pb";

vi.mock("@/server/social/usecase/social.usecase", () => ({ listFriends: vi.fn() }));
vi.mock("@/server/social/usecase/contacts/findContacts.usecase", () => ({ findContacts: vi.fn() }));
vi.mock("@/server/social/usecase/contacts/sendFriendRequests.usecase", () => ({
  sendFriendRequests: vi.fn(),
}));
vi.mock("@/server/api/connect/context", () => ({
  requireUser: vi.fn(),
  runUsecase: vi.fn((operation: () => Promise<unknown>) => operation()),
}));
vi.mock("@/server/api/connect/rpcRateLimit", () => ({
  RPC_RATE_LIMITS: { getOverallBalances: 60, findContacts: 5, sendFriendRequests: 3 },
  requireRateLimitedUser: vi.fn().mockResolvedValue("user-123"),
}));

import { requireRateLimitedUser } from "@/server/api/connect/rpcRateLimit";
import { listFriends } from "@/server/social/usecase/social.usecase";
import { findContacts } from "@/server/social/usecase/contacts/findContacts.usecase";
import { sendFriendRequests } from "@/server/social/usecase/contacts/sendFriendRequests.usecase";
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

  it("charges contact lookups to their own small bucket", async () => {
    vi.mocked(findContacts).mockResolvedValue({ contacts: [], remainingToday: 5000 });
    const context = {} as HandlerContext;

    await socialHandler.findContacts(
      create(FindContactsRequestSchema, { phones: ["+16175551212"], emails: ["a@example.com"] }),
      context,
    );

    expect(requireRateLimitedUser).toHaveBeenCalledWith(context, "find-contacts", 5);
    expect(findContacts).toHaveBeenCalledWith("user-123", {
      phones: ["+16175551212"],
      emails: ["a@example.com"],
    });
  });

  it("charges a whole bulk send to one slot of its own bucket", async () => {
    const context = {} as HandlerContext;

    await socialHandler.sendFriendRequests(
      create(SendFriendRequestsRequestSchema, { userIds: ["friend-1", "friend-2"] }),
      context,
    );

    expect(requireRateLimitedUser).toHaveBeenCalledTimes(1);
    expect(requireRateLimitedUser).toHaveBeenCalledWith(context, "send-friend-requests", 3);
    expect(sendFriendRequests).toHaveBeenCalledWith("user-123", ["friend-1", "friend-2"]);
  });
});
