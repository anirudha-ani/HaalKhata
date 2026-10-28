/** Tests for social identity lookup, friendship creation, and what each side of a pending request may see. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/server/auth/repo/users.repo";

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
vi.mock("@/server/social/repo/activity.repo", () => ({
  listActivityMonths: vi.fn(),
  listActivityPage: vi.fn(),
}));
vi.mock("@/server/group/repo/groups.repo", () => ({
  isMember: vi.fn(),
}));
vi.mock("@/server/common/db/db", () => ({
  transaction: vi.fn((operation) => operation({ query: vi.fn() })),
  isUniqueViolation: vi.fn(() => false),
}));
vi.mock("@/server/social/repo/inviteLinks.repo", () => ({
  findActiveGroupLink: vi.fn(),
  findActiveLinkByToken: vi.fn(),
  insertInviteLink: vi.fn(),
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

import {
  findUserByEmail,
  findUserById,
  findUserByPhone,
  findUsersByIds,
} from "@/server/auth/repo/users.repo";
import { getOverallBalances } from "@/server/expense/usecase/balance.usecase";
import { SOCIAL_READ_MAX_BYTES } from "@/server/api/connect/connect.constants";
import {
  countIncomingFriendRequests,
  deleteFriendRequest,
  deleteOutgoingFriendRequest,
  friendshipExists,
  insertFriendRequest,
  insertFriendship,
  listFriendIds,
  listIncomingFriendRequestIds,
  listOutgoingFriendRequests,
} from "@/server/social/repo/friendships.repo";
import {
  countUnread,
  insertNotifications,
  listNotificationsByUser,
} from "@/server/social/repo/notifications.repo";
import {
  addFriend,
  cancelFriendRequest,
  listFriends,
  listNotifications,
  respondFriendRequest,
} from "./social.usecase";

const CALLER = "user-caller";
/** How long refusing a hostile email may take; the old pattern took minutes at this size. */
const HOSTILE_EMAIL_BUDGET_MS = 100;
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
  phone_verified_at: null,
  token_version: 0,
  created_at: "2026-08-01T00:00:00Z",
} satisfies UserRow;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockResolvedValue({ ...targetRow, id: CALLER, name: "Caller" });
  vi.mocked(friendshipExists).mockResolvedValue(false);
  vi.mocked(insertFriendRequest).mockResolvedValue(true);
});

describe("addFriend contact lookup", () => {
  it("keeps the request flow for a registered account", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(targetRow);

    await expect(addFriend(CALLER, { email: TARGET_EMAIL, phone: "" })).resolves.toEqual({});

    expect(insertFriendship).not.toHaveBeenCalled();
    // The typed address rides along so the sender's list can echo it back.
    expect(insertFriendRequest).toHaveBeenCalledWith(CALLER, TARGET, expect.anything(), TARGET_EMAIL);
    expect(insertNotifications).toHaveBeenCalledWith(
      [TARGET],
      expect.objectContaining({ type: "friend_request", link: "/friends" }),
      expect.anything(),
    );
  });

  it("refuses an email nobody on HaalKhata has, and records nothing for it", async () => {
    // The person is reached through the caller's own invite link and signs
    // up as themselves; nothing is made here for anyone to claim later.
    vi.mocked(findUserByEmail).mockResolvedValue(undefined);

    await expect(addFriend(CALLER, { email: TARGET_EMAIL, phone: "" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringContaining("share your invite link"),
    });

    expect(findUserByEmail).toHaveBeenCalledWith(TARGET_EMAIL);
    expect(insertFriendship).not.toHaveBeenCalled();
    expect(insertFriendRequest).not.toHaveBeenCalled();
    expect(insertNotifications).not.toHaveBeenCalled();
  });

  it("looks a typed phone up in E.164 and refuses it when nobody has it", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(undefined);

    await expect(addFriend(CALLER, { email: "", phone: "+1 (415) 555-2671" })).rejects.toMatchObject({
      code: "failed_precondition",
    });

    expect(findUserByPhone).toHaveBeenCalledWith("+14155552671");
    expect(insertFriendship).not.toHaveBeenCalled();
  });

  it("refuses a malformed email before looking anybody up", async () => {
    await expect(addFriend(CALLER, { email: "not-an-address", phone: "" })).rejects.toMatchObject({
      code: "invalid_argument",
    });

    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("refuses an email field the size of a whole request at once, before looking anybody up", async () => {
    // Shaped to make a backtracking email pattern try every split of the dots.
    const hostile = `a@${".".repeat(SOCIAL_READ_MAX_BYTES)}@`;
    const start = performance.now();
    await expect(addFriend(CALLER, { email: hostile, phone: "" })).rejects.toMatchObject({
      code: "invalid_argument",
    });

    expect(performance.now() - start).toBeLessThan(HOSTILE_EMAIL_BUDGET_MS);
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("answers a stale picked id quietly, without a request", async () => {
    vi.mocked(findUserById).mockResolvedValue(undefined);

    await expect(addFriend(CALLER, { email: "", phone: "", userId: "gone" })).resolves.toEqual({});

    expect(insertFriendRequest).not.toHaveBeenCalled();
  });

  it("does not reveal or notify a duplicate pending request", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(targetRow);
    vi.mocked(insertFriendRequest).mockResolvedValue(false);

    const result = await addFriend(CALLER, { email: TARGET_EMAIL, phone: "" });

    expect(result).toEqual({});
    expect(insertFriendship).not.toHaveBeenCalled();
    expect(insertNotifications).not.toHaveBeenCalled();
  });

  it("does not create a pending request for an accepted friendship", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(targetRow);
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

describe("what each side of a pending request may see", () => {
  const SENT_AT = "2026-09-08T10:00:00.000Z";
  const PICKED = "user-picked";

  beforeEach(() => {
    vi.mocked(getOverallBalances).mockResolvedValue({ counterparties: [] } as never);
    vi.mocked(listFriendIds).mockResolvedValue([]);
    vi.mocked(listIncomingFriendRequestIds).mockResolvedValue([]);
    vi.mocked(findUsersByIds).mockImplementation(async (userIds) =>
      userIds.map((userId) => ({ ...targetRow, id: userId, name: `Name of ${userId}` })),
    );
  });

  it("keeps nothing to echo when the sender picked the recipient by id", async () => {
    vi.mocked(findUserById).mockImplementation(async (lookupId) =>
      lookupId === CALLER ? { ...targetRow, id: CALLER, name: "Caller" } : targetRow,
    );

    await addFriend(CALLER, { email: "", phone: "", userId: TARGET });

    expect(insertFriendRequest).toHaveBeenCalledOnce();
    expect(vi.mocked(insertFriendRequest).mock.calls[0]?.[3]).toBeUndefined();
  });

  it("echoes a typed identifier back to the sender without resolving the account", async () => {
    vi.mocked(listOutgoingFriendRequests).mockResolvedValue([
      { recipient_id: TARGET, recipient_identifier: TARGET_EMAIL, created_at: SENT_AT },
    ]);

    const result = await listFriends(CALLER);

    expect(result.outgoingRequests).toEqual([{ identifier: TARGET_EMAIL, createdAt: SENT_AT }]);
    expect(findUsersByIds).not.toHaveBeenCalledWith(expect.arrayContaining([TARGET]));
  });

  it("shows a recipient the sender picked by id through the minimal projection", async () => {
    vi.mocked(listOutgoingFriendRequests).mockResolvedValue([
      { recipient_id: PICKED, recipient_identifier: null, created_at: SENT_AT },
    ]);

    const result = await listFriends(CALLER);

    expect(result.outgoingRequests).toEqual([
      {
        user: expect.objectContaining({ id: PICKED, name: `Name of ${PICKED}`, email: "", phone: "" }),
        createdAt: SENT_AT,
      },
    ]);
  });

  it("counts the caller's unanswered incoming requests alongside notifications", async () => {
    vi.mocked(listNotificationsByUser).mockResolvedValue([]);
    vi.mocked(countUnread).mockResolvedValue(2);
    vi.mocked(countIncomingFriendRequests).mockResolvedValue(3);

    await expect(listNotifications(TARGET)).resolves.toMatchObject({
      unreadCount: 2,
      pendingFriendRequestCount: 3,
    });
    expect(countIncomingFriendRequests).toHaveBeenCalledWith(TARGET);
  });
});

describe("cancelFriendRequest", () => {
  it("withdraws a request named by the recipient the caller picked", async () => {
    vi.mocked(deleteOutgoingFriendRequest).mockResolvedValue(true);

    await cancelFriendRequest(CALLER, { userId: TARGET, identifier: "" });

    expect(deleteOutgoingFriendRequest).toHaveBeenCalledWith(CALLER, { recipientId: TARGET });
  });

  it("withdraws a request named by the identifier the caller typed", async () => {
    vi.mocked(deleteOutgoingFriendRequest).mockResolvedValue(true);

    await cancelFriendRequest(CALLER, { userId: "", identifier: TARGET_EMAIL });

    expect(deleteOutgoingFriendRequest).toHaveBeenCalledWith(CALLER, {
      recipientIdentifier: TARGET_EMAIL,
    });
  });

  it("insists on exactly one way of naming the request", async () => {
    await expect(
      cancelFriendRequest(CALLER, { userId: TARGET, identifier: TARGET_EMAIL }),
    ).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(cancelFriendRequest(CALLER, { userId: "", identifier: "" })).rejects.toMatchObject({
      code: "invalid_argument",
    });

    expect(deleteOutgoingFriendRequest).not.toHaveBeenCalled();
  });

  it("reports a request that is no longer pending as not found", async () => {
    vi.mocked(deleteOutgoingFriendRequest).mockResolvedValue(false);

    await expect(cancelFriendRequest(CALLER, { userId: TARGET, identifier: "" })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
