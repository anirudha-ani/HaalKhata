/** Unit tests for SendFriendRequests: limits, who is skipped and what gets notified. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { UserRow } from "@/server/auth/repo/users.repo";

const { transactionClient } = vi.hoisted(() => ({
  transactionClient: { query: vi.fn() } as unknown as PoolClient,
}));

vi.mock("@/server/common/db/db", () => ({
  transaction: vi.fn(async (operation: (client: PoolClient) => Promise<unknown>) =>
    operation(transactionClient),
  ),
}));
vi.mock("@/server/auth/repo/users.repo", () => ({ findUserById: vi.fn() }));
vi.mock("@/server/social/repo/contacts/contactDiscovery.repo", () => ({
  findRequestableAccounts: vi.fn(),
}));
vi.mock("@/server/social/repo/friendships.repo", () => ({ insertFriendRequests: vi.fn() }));
vi.mock("@/server/social/repo/notifications.repo", () => ({ insertNotifications: vi.fn() }));

import { findUserById } from "@/server/auth/repo/users.repo";
import { findRequestableAccounts } from "@/server/social/repo/contacts/contactDiscovery.repo";
import { insertFriendRequests } from "@/server/social/repo/friendships.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { MAX_FRIEND_REQUESTS_PER_SEND } from "@/server/social/social.constants";
import { sendFriendRequests } from "./sendFriendRequests.usecase";

/**
 * A registered account.
 *
 * @param userId - Its id.
 * @param overrides - Columns to change.
 * @returns The users row.
 */
function user(userId: string, overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: userId,
    email: `${userId}@example.com`,
    name: userId === "caller" ? "Anirudha" : "Someone",
    avatar_color: "#0f8a5f",
    avatar_url: null,
    default_currency: "USD",
    password_hash: null,
    phone: null,
    phone_verified_at: null,
    google_sub: `google-${userId}`,
    onboarded_at: null,
    token_version: 1,
    created_at: "2026-10-01T00:00:00Z",
    contact_discovery: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockResolvedValue(user("caller"));
  vi.mocked(findRequestableAccounts).mockResolvedValue([]);
  vi.mocked(insertFriendRequests).mockResolvedValue([]);
});

describe("sendFriendRequests", () => {
  it("refuses an empty list", async () => {
    await expect(sendFriendRequests("caller", [" ", ""])).rejects.toMatchObject({
      code: "invalid_argument",
    });
  });

  it("refuses more than 50 people in one call", async () => {
    const recipientIds = Array.from(
      { length: MAX_FRIEND_REQUESTS_PER_SEND + 1 },
      (_unusedValue, index) => `person-${index}`,
    );
    await expect(sendFriendRequests("caller", recipientIds)).rejects.toMatchObject({
      code: "invalid_argument",
    });
    expect(findRequestableAccounts).not.toHaveBeenCalled();
  });

  it("deduplicates ids and asks only the accounts that can take a request", async () => {
    vi.mocked(findRequestableAccounts).mockResolvedValue([
      user("rifat"),
      user("invited", { google_sub: null }),
    ]);
    vi.mocked(insertFriendRequests).mockResolvedValue(["rifat"]);

    await sendFriendRequests("caller", ["rifat", " rifat ", "invited", "blocked"]);

    expect(findRequestableAccounts).toHaveBeenCalledWith("caller", ["rifat", "invited", "blocked"]);
    // Unregistered rows are dropped in the usecase whatever the repo returns.
    expect(insertFriendRequests).toHaveBeenCalledWith("caller", ["rifat"], transactionClient);
  });

  it("notifies only the recipients whose request was actually inserted, in the same transaction", async () => {
    vi.mocked(findRequestableAccounts).mockResolvedValue([user("rifat"), user("tania")]);
    vi.mocked(insertFriendRequests).mockResolvedValue(["tania"]);

    await sendFriendRequests("caller", ["rifat", "tania"]);

    expect(insertNotifications).toHaveBeenCalledWith(
      ["tania"],
      {
        actorId: "caller",
        type: "friend_request",
        title: "Anirudha sent you a friend request",
        body: "Accept or decline it from Friends.",
        link: "/friends",
      },
      transactionClient,
    );
  });

  it("writes nothing when nobody listed can take a request", async () => {
    await sendFriendRequests("caller", ["caller", "friend"]);
    expect(insertFriendRequests).not.toHaveBeenCalled();
    expect(insertNotifications).not.toHaveBeenCalled();
  });
});
