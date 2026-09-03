/** Authorization tests for social identity lookup and friendship creation. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/server/auth/repo/users.repo";

vi.mock("@/server/social/repo/friendships.repo", () => ({
  deleteFriendRequest: vi.fn(),
  friendshipExists: vi.fn(),
  insertFriendRequest: vi.fn(),
  insertFriendship: vi.fn(),
  listFriendIds: vi.fn(),
  listIncomingFriendRequestIds: vi.fn(),
}));
vi.mock("@/server/auth/repo/users.repo", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  findUserByPhone: vi.fn(),
  findUsersByIds: vi.fn(),
}));
vi.mock("@/server/social/repo/activity.repo", () => ({
  listActivityMonths: vi.fn(),
  listActivityPage: vi.fn(),
}));
vi.mock("@/server/group/repo/groups.repo", () => ({
  isMember: vi.fn(),
}));
vi.mock("@/server/common/db", () => ({
  transaction: vi.fn((operation) => operation({ query: vi.fn() })),
  isUniqueViolation: vi.fn(() => false),
}));
vi.mock("@/server/auth/usecase/auth.usecase", () => ({
  findOrCreateUserByEmail: vi.fn(),
  findOrCreateUserByPhone: vi.fn(),
}));
vi.mock("@/server/auth/repo/accountMerge.repo", () => ({ mergeAccounts: vi.fn() }));
vi.mock("@/server/social/repo/inviteLinks.repo", () => ({
  findActiveFriendLink: vi.fn(),
  findActiveGroupLink: vi.fn(),
  findActiveLinkByToken: vi.fn(),
  insertInviteLink: vi.fn(),
  revokeFriendLinksFor: vi.fn(),
  revokeGroupLinks: vi.fn(),
}));
vi.mock("@/server/social/repo/notifications.repo", () => ({
  countUnread: vi.fn(),
  findLatestNotificationAt: vi.fn(),
  insertNotifications: vi.fn(),
  listNotificationsByUser: vi.fn(),
  markAllRead: vi.fn(),
}));
vi.mock("@/server/expense/usecase/balance.usecase", () => ({
  getOverallBalances: vi.fn(),
  netWithUser: vi.fn(),
}));

import { findUserById } from "@/server/auth/repo/users.repo";
import { findOrCreateUserByEmail } from "@/server/auth/usecase/auth.usecase";
import {
  deleteFriendRequest,
  friendshipExists,
  insertFriendRequest,
  insertFriendship,
} from "@/server/social/repo/friendships.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { addFriend, respondFriendRequest } from "./social.usecase";

const CALLER = "user-caller";
const TARGET = "user-target";
const TARGET_EMAIL = "target@example.com";

/** User row returned by contact lookup. */
const targetRow = {
  id: TARGET,
  email: TARGET_EMAIL,
  name: "Target User",
  avatar_color: "#123456",
  avatar_url: null,
  default_currency: "USD",
  password_hash: null,
  phone: null,
  google_sub: "google-target",
  onboarded_at: null,
  merged_into: null,
  token_version: 0,
  created_at: "2026-08-01T00:00:00Z",
  payment_handles: [],
} satisfies UserRow;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockResolvedValue({ ...targetRow, id: CALLER, name: "Caller" });
  vi.mocked(friendshipExists).mockResolvedValue(false);
  vi.mocked(insertFriendRequest).mockResolvedValue(true);
});

describe("addFriend contact lookup", () => {
  it("keeps the request flow for a registered account", async () => {
    vi.mocked(findOrCreateUserByEmail).mockResolvedValue(targetRow);

    await expect(addFriend(CALLER, { email: TARGET_EMAIL, phone: "" })).resolves.toEqual({});

    expect(insertFriendship).not.toHaveBeenCalled();
    expect(insertFriendRequest).toHaveBeenCalledWith(CALLER, TARGET, expect.anything());
    expect(insertNotifications).toHaveBeenCalledWith(
      [TARGET],
      expect.objectContaining({ type: "friend_request", link: "/friends" }),
      expect.anything(),
    );
  });

  it("befriends an unregistered contact immediately as Invited (§33)", async () => {
    // Nobody exists to accept, and an unregistered row can hold no
    // transactions, so the entry is a contact-book line until claimed.
    vi.mocked(findOrCreateUserByEmail).mockResolvedValue({
      ...targetRow,
      id: "invited-1",
      google_sub: null,
      password_hash: null,
    });

    await expect(addFriend(CALLER, { email: TARGET_EMAIL, phone: "" })).resolves.toEqual({});

    expect(insertFriendship).toHaveBeenCalledWith(CALLER, "invited-1");
    expect(insertFriendRequest).not.toHaveBeenCalled();
    expect(insertNotifications).not.toHaveBeenCalled();
  });

  it("does not reveal or notify a duplicate pending request", async () => {
    vi.mocked(findOrCreateUserByEmail).mockResolvedValue(targetRow);
    vi.mocked(insertFriendRequest).mockResolvedValue(false);

    const result = await addFriend(CALLER, { email: TARGET_EMAIL, phone: "" });

    expect(result).toEqual({});
    expect(insertFriendship).not.toHaveBeenCalled();
    expect(insertNotifications).not.toHaveBeenCalled();
  });

  it("does not create a pending request for an accepted friendship", async () => {
    vi.mocked(findOrCreateUserByEmail).mockResolvedValue(targetRow);
    vi.mocked(friendshipExists).mockResolvedValue(true);

    await expect(addFriend(CALLER, { email: TARGET_EMAIL, phone: "" })).resolves.toEqual({});

    expect(insertFriendRequest).not.toHaveBeenCalled();
    expect(insertNotifications).not.toHaveBeenCalled();
  });
});

describe("respondFriendRequest", () => {
  it("creates a friendship only after consuming the caller's incoming request", async () => {
    vi.mocked(deleteFriendRequest).mockResolvedValue(true);

    await respondFriendRequest(TARGET, CALLER, true);

    expect(deleteFriendRequest).toHaveBeenCalledWith(CALLER, TARGET, expect.anything());
    expect(insertFriendship).toHaveBeenCalledWith(TARGET, CALLER, expect.anything());
  });

  it("declines without creating friendship rows", async () => {
    vi.mocked(deleteFriendRequest).mockResolvedValue(true);

    await respondFriendRequest(TARGET, CALLER, false);

    expect(insertFriendship).not.toHaveBeenCalled();
  });

  it("rejects ids that did not send an incoming request", async () => {
    vi.mocked(deleteFriendRequest).mockResolvedValue(false);

    await expect(respondFriendRequest(TARGET, CALLER, true)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(insertFriendship).not.toHaveBeenCalled();
  });
});
