/** Unit tests for invite links: minting, authorization, preview, and acceptance. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { UserRow } from "@/server/auth/repo/users.repo";
import type { InviteLinkRow } from "@/server/social/repo/inviteLinks.repo";

const { transactionClient } = vi.hoisted(() => ({
  transactionClient: { query: vi.fn() } as unknown as PoolClient,
}));

vi.mock("@/server/safety/repo/safety.repo", () => ({ blockedBetween: vi.fn(async () => false), blockedPairExists: vi.fn(async () => false) }));

vi.mock("@/server/social/repo/friendships.repo", () => ({
  countIncomingFriendRequests: vi.fn(),
  deleteFriendRequest: vi.fn(),
  deleteOutgoingFriendRequest: vi.fn(),
  friendshipExists: vi.fn(),
  insertFriendRequest: vi.fn(),
  insertFriendship: vi.fn(),
  listFriendIds: vi.fn(),
  listIncomingFriendRequestIds: vi.fn(),
  listOutgoingFriendRequests: vi.fn(),
}));
vi.mock("@/server/auth/repo/users.repo", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  findUserByPhone: vi.fn(),
  findUsersByIds: vi.fn(),
}));
vi.mock("@/server/social/repo/inviteLinks.repo", () => ({
  findActiveGroupLink: vi.fn(),
  findActiveLinkByToken: vi.fn(),
  findActiveProfileLink: vi.fn(),
  insertInviteLink: vi.fn(),
  revokeGroupLinks: vi.fn(),
  revokeProfileLinks: vi.fn(),
}));
vi.mock("@/server/group/repo/groups.repo", () => ({
  addMember: vi.fn(),
  countGroupMemberships: vi.fn(async () => new Map()),
  findGroupById: vi.fn(),
  isMember: vi.fn(),
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
vi.mock("@/server/common/db/db", () => ({
  transaction: vi.fn((operation: (client: PoolClient) => Promise<unknown>) =>
    operation(transactionClient),
  ),
  isUniqueViolation: vi.fn(
    (error: unknown) => (error as { code?: string } | null)?.code === "23505",
  ),
}));

import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import {
  findActiveGroupLink,
  findActiveLinkByToken,
  findActiveProfileLink,
  insertInviteLink,
  revokeGroupLinks,
} from "@/server/social/repo/inviteLinks.repo";
import {
  friendshipExists,
  insertFriendRequest,
  insertFriendship,
} from "@/server/social/repo/friendships.repo";
import {
  addMember,
  findGroupById,
  isMember,
  listMembers,
  memberRole,
} from "@/server/group/repo/groups.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import {
  acceptInviteLink,
  createGroupInviteLink,
  getProfileInviteLink,
  previewInviteLink,
  revokeGroupInviteLink,
} from "./social.usecase";

const CALLER = "user-caller";
const INVITER = "user-inviter";
const GROUP = "group-1";
const TOKEN = "a".repeat(43);

/**
 * Builds a users row with defaults for the columns a test does not care about.
 *
 * @param overrides - Columns to set explicitly.
 * @returns A complete UserRow.
 */
function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: CALLER,
    email: "someone@example.com",
    name: "Someone",
    avatar_color: "#123456",
    avatar_url: null,
    default_currency: "USD",
    password_hash: null,
    phone: null,
    google_sub: "google-someone",
    onboarded_at: null,
    phone_verified_at: null,
    token_version: 0,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * Builds an invite-link row.
 *
 * @param overrides - Columns to set explicitly.
 * @returns A complete link row.
 */
function linkRow(overrides: Partial<InviteLinkRow> = {}): InviteLinkRow {
  return {
    token: TOKEN,
    kind: "profile",
    inviter_id: INVITER,
    group_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockImplementation(async (userId: string) => {
    if (userId === INVITER) return userRow({ id: INVITER, name: "Anirudha" });
    return userRow({ id: userId });
  });
  vi.mocked(findUsersByIds).mockResolvedValue([]);
  vi.mocked(friendshipExists).mockResolvedValue(true);
});

describe("createGroupInviteLink / revokeGroupInviteLink", () => {
  beforeEach(() => {
    vi.mocked(findGroupById).mockResolvedValue({
      id: GROUP,
      name: "Bali Trip",
      type: "trip",
      currency: "USD",
      created_by: INVITER,
      created_at: "2026-09-01T00:00:00Z",
      simplify_debts: false,
    } as never);
  });

  it("lets any member mint the group's one link", async () => {
    vi.mocked(isMember).mockResolvedValue(true);
    vi.mocked(findActiveGroupLink).mockResolvedValue(undefined);

    const { token } = await createGroupInviteLink(CALLER, GROUP);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(insertInviteLink).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "group", groupId: GROUP }),
    );
  });

  it("refuses a non-member", async () => {
    vi.mocked(isMember).mockResolvedValue(false);

    await expect(createGroupInviteLink(CALLER, GROUP)).rejects.toMatchObject({
      code: "permission_denied",
    });
  });

  it("lets only the owner revoke", async () => {
    vi.mocked(memberRole).mockResolvedValue("member");
    await expect(revokeGroupInviteLink(CALLER, GROUP)).rejects.toMatchObject({
      code: "permission_denied",
    });
    expect(revokeGroupLinks).not.toHaveBeenCalled();

    vi.mocked(memberRole).mockResolvedValue("owner");
    await revokeGroupInviteLink(CALLER, GROUP);
    expect(revokeGroupLinks).toHaveBeenCalledWith(GROUP);
  });
});

describe("previewInviteLink", () => {
  it("gives every dead shape one identical sentence", async () => {
    const expected = { code: "not_found", message: expect.stringContaining("isn't valid") };

    await expect(previewInviteLink("not-a-token")).rejects.toMatchObject(expected);

    vi.mocked(findActiveLinkByToken).mockResolvedValue(undefined);
    await expect(previewInviteLink(TOKEN)).rejects.toMatchObject(expected);

    // A profile link speaks for its owner; once they are gone it is dead.
    vi.mocked(findActiveLinkByToken).mockResolvedValue(linkRow());
    vi.mocked(findUserById).mockResolvedValue(undefined);
    await expect(previewInviteLink(TOKEN)).rejects.toMatchObject(expected);
  });

  it("names the group and its size for a group link", async () => {
    vi.mocked(findActiveLinkByToken).mockResolvedValue(
      linkRow({ kind: "group", group_id: GROUP }),
    );
    vi.mocked(findGroupById).mockResolvedValue({ id: GROUP, name: "Bali Trip" } as never);
    vi.mocked(listMembers).mockResolvedValue([{ id: "a" }, { id: "b" }] as never);

    await expect(previewInviteLink(TOKEN)).resolves.toEqual({
      kind: "group",
      inviterName: "Anirudha",
      groupName: "Bali Trip",
      memberCount: 2,
      invitedName: "",
    });
  });
});

describe("acceptInviteLink", () => {
  it("refuses a group join when the roster is at its ceiling", async () => {
    vi.mocked(findActiveLinkByToken).mockResolvedValue(
      linkRow({ kind: "group", group_id: GROUP }),
    );
    vi.mocked(findGroupById).mockResolvedValue({ id: GROUP, name: "Bali Trip" } as never);
    vi.mocked(isMember).mockResolvedValue(false);
    vi.mocked(listMembers).mockResolvedValue(
      Array.from({ length: 100 }, (unused, index) => ({ id: `member-${index}` })) as never,
    );

    await expect(acceptInviteLink(CALLER, TOKEN)).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("full"),
    });
    expect(addMember).not.toHaveBeenCalled();
  });

  it("enrols a group-link acceptor under the group lock, with the feed event", async () => {
    vi.mocked(findActiveLinkByToken).mockResolvedValue(
      linkRow({ kind: "group", group_id: GROUP }),
    );
    vi.mocked(findGroupById).mockResolvedValue({ id: GROUP, name: "Bali Trip" } as never);
    vi.mocked(isMember).mockResolvedValue(false);
    vi.mocked(listMembers).mockResolvedValue([{ id: CALLER }, { id: INVITER }] as never);

    await expect(acceptInviteLink(CALLER, TOKEN)).resolves.toEqual({ groupId: GROUP });

    expect(addMember).toHaveBeenCalledWith(GROUP, CALLER, "member", transactionClient);
    expect(insertFriendship).toHaveBeenCalledWith(CALLER, INVITER, transactionClient);
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: GROUP,
        type: "member_added",
        message: expect.stringContaining("joined"),
      }),
      transactionClient,
    );
  });

  it("re-accepting a group link is a quiet no-op", async () => {
    vi.mocked(findActiveLinkByToken).mockResolvedValue(
      linkRow({ kind: "group", group_id: GROUP }),
    );
    vi.mocked(findGroupById).mockResolvedValue({ id: GROUP, name: "Bali Trip" } as never);
    vi.mocked(isMember).mockResolvedValue(true);

    await expect(acceptInviteLink(CALLER, TOKEN)).resolves.toEqual({ groupId: GROUP });
    expect(addMember).not.toHaveBeenCalled();
    expect(insertActivity).not.toHaveBeenCalled();
  });
});

describe("profile links (§33a)", () => {
  it("mints the caller's one link and reuses it after", async () => {
    vi.mocked(findActiveProfileLink).mockResolvedValue(undefined);

    const { token } = await getProfileInviteLink(CALLER);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(insertInviteLink).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "profile", inviterId: CALLER }),
    );

    vi.mocked(findActiveProfileLink).mockResolvedValue(
      linkRow({ kind: "profile", inviter_id: CALLER }),
    );
    await expect(getProfileInviteLink(CALLER)).resolves.toEqual({ token: TOKEN });
  });

  it("previews as the owner's connect card", async () => {
    vi.mocked(findActiveLinkByToken).mockResolvedValue(
      linkRow({ kind: "profile" }),
    );

    await expect(previewInviteLink(TOKEN)).resolves.toEqual({
      kind: "profile",
      inviterName: "Anirudha",
      groupName: "",
      memberCount: 0,
      invitedName: "",
    });
  });

  it("accepting sends a friend request and notifies — never instant friendship", async () => {
    // A leaked bearer link must not attach a stranger to the owner's picker.
    vi.mocked(findActiveLinkByToken).mockResolvedValue(
      linkRow({ kind: "profile" }),
    );
    vi.mocked(friendshipExists).mockResolvedValue(false);
    vi.mocked(insertFriendRequest).mockResolvedValue(true);

    await expect(acceptInviteLink(CALLER, TOKEN)).resolves.toEqual({ groupId: "" });

    expect(insertFriendship).not.toHaveBeenCalled();
    expect(insertFriendRequest).toHaveBeenCalledWith(CALLER, INVITER, expect.anything());
    expect(insertNotifications).toHaveBeenCalledWith(
      [INVITER],
      expect.objectContaining({ type: "friend_request" }),
      expect.anything(),
    );
  });

  it("accepts quietly when already friends or already requested", async () => {
    vi.mocked(findActiveLinkByToken).mockResolvedValue(
      linkRow({ kind: "profile" }),
    );

    vi.mocked(friendshipExists).mockResolvedValue(true);
    await expect(acceptInviteLink(CALLER, TOKEN)).resolves.toEqual({ groupId: "" });
    expect(insertFriendRequest).not.toHaveBeenCalled();

    vi.mocked(friendshipExists).mockResolvedValue(false);
    vi.mocked(insertFriendRequest).mockResolvedValue(false);
    await expect(acceptInviteLink(CALLER, TOKEN)).resolves.toEqual({ groupId: "" });
    expect(insertNotifications).not.toHaveBeenCalled();
  });

  it("refuses the owner's own link", async () => {
    vi.mocked(findActiveLinkByToken).mockResolvedValue(
      linkRow({ kind: "profile", inviter_id: CALLER }),
    );

    await expect(acceptInviteLink(CALLER, TOKEN)).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("your own invite link"),
    });
  });
});
