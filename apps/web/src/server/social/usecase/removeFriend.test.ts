/** Unit tests for removeFriend (§37): the settled-balance gate and what removal touches. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { UserRow } from "@/server/auth/repo/users.repo";

const { transactionClient } = vi.hoisted(() => ({
  transactionClient: { query: vi.fn() } as unknown as PoolClient,
}));

vi.mock("@/server/social/repo/friendships.repo", () => ({
  deleteFriendRequest: vi.fn(),
  deleteFriendship: vi.fn(),
  friendshipExists: vi.fn(),
  insertFriendRequest: vi.fn(),
  insertFriendship: vi.fn(),
  listFriendIds: vi.fn(),
  listIncomingFriendRequestIds: vi.fn(),
}));
vi.mock("@/server/auth/repo/users.repo", () => ({
  findUserById: vi.fn(),
  findUsersByIds: vi.fn(),
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
  findActiveProfileLink: vi.fn(),
  insertInviteLink: vi.fn(),
  revokeFriendLinkForPair: vi.fn(),
  revokeFriendLinksFor: vi.fn(),
  revokeGroupLinks: vi.fn(),
  revokeProfileLinks: vi.fn(),
}));
vi.mock("@/server/group/repo/groups.repo", () => ({
  addMember: vi.fn(),
  findGroupById: vi.fn(),
  isMember: vi.fn(),
  listGroupsByUser: vi.fn(),
  listMembers: vi.fn(),
  memberRole: vi.fn(),
}));
vi.mock("@/server/social/repo/activity.repo", () => ({
  insertActivity: vi.fn(),
  listActivityMonths: vi.fn(),
  listActivityPage: vi.fn(),
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
vi.mock("@/server/common/ledgerLocks", () => ({
  lockFriendRequestInboxes: vi.fn(),
  lockGroupLedgers: vi.fn(),
  lockParticipantLedgers: vi.fn(),
  lockReminder: vi.fn(),
  withLedgerTransaction: vi.fn(),
}));
vi.mock("@/server/common/db", () => ({
  transaction: vi.fn((operation: (client: PoolClient) => Promise<unknown>) =>
    operation(transactionClient),
  ),
  isUniqueViolation: vi.fn(),
}));

import { findUserById } from "@/server/auth/repo/users.repo";
import { deleteFriendship, friendshipExists } from "@/server/social/repo/friendships.repo";
import { revokeFriendLinkForPair } from "@/server/social/repo/inviteLinks.repo";
import { netWithUser } from "@/server/expense/usecase/balance.usecase";
import {
  lockFriendRequestInboxes,
  lockParticipantLedgers,
} from "@/server/common/ledgerLocks";
import { removeFriend } from "./social.usecase";

const CALLER = "user-caller";
const FRIEND = "user-friend";

const friendRow: UserRow = {
  id: FRIEND,
  email: "rifat@example.com",
  name: "Rifat",
  avatar_color: "#0f8a5f",
  avatar_url: null,
  default_currency: "USD",
  password_hash: null,
  phone: null,
  phone_verified_at: null,
  google_sub: "google-rifat",
  onboarded_at: "2026-09-01T00:00:00Z",
  merged_into: null,
  token_version: 0,
  created_at: "2026-09-01T00:00:00Z",
  payment_handles: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockResolvedValue(friendRow);
  vi.mocked(friendshipExists).mockResolvedValue(true);
  vi.mocked(netWithUser).mockResolvedValue(new Map());
});

describe("removeFriend", () => {
  it("refuses to remove yourself", async () => {
    await expect(removeFriend(CALLER, CALLER)).rejects.toMatchObject({
      code: "invalid_argument",
    });
    expect(deleteFriendship).not.toHaveBeenCalled();
  });

  it("refuses somebody who is not a friend", async () => {
    vi.mocked(friendshipExists).mockResolvedValue(false);

    await expect(removeFriend(CALLER, FRIEND)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(deleteFriendship).not.toHaveBeenCalled();
  });

  it("refuses while any currency bucket is outstanding", async () => {
    // Settled in USD is not settled: one open euro keeps the friendship.
    vi.mocked(netWithUser).mockResolvedValue(
      new Map([
        ["USD", 0],
        ["EUR", -450],
      ]),
    );

    await expect(removeFriend(CALLER, FRIEND)).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringContaining("Settle up first"),
    });
    expect(deleteFriendship).not.toHaveBeenCalled();
    expect(revokeFriendLinkForPair).not.toHaveBeenCalled();
  });

  it("checks the balance only under both lock families", async () => {
    // The zero read is only trustworthy while one-off writers are held out;
    // locks taken after the check would guard nothing.
    const order: string[] = [];
    vi.mocked(lockFriendRequestInboxes).mockImplementation(async () => {
      order.push("inboxes");
    });
    vi.mocked(lockParticipantLedgers).mockImplementation(async () => {
      order.push("ledgers");
    });
    vi.mocked(netWithUser).mockImplementation(async () => {
      order.push("net");
      return new Map();
    });

    await removeFriend(CALLER, FRIEND);

    expect(order).toEqual(["inboxes", "ledgers", "net"]);
  });

  it("deletes the friendship and revokes the pair's claim link when settled", async () => {
    vi.mocked(netWithUser).mockResolvedValue(new Map([["USD", 0]]));

    await removeFriend(CALLER, FRIEND);

    expect(deleteFriendship).toHaveBeenCalledWith(CALLER, FRIEND, transactionClient);
    expect(revokeFriendLinkForPair).toHaveBeenCalledWith(CALLER, FRIEND, transactionClient);
  });
});
