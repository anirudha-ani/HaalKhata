/** Authorization tests for social identity lookup and friendship creation. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/server/auth/repo/users.repo";

vi.mock("@/server/social/repo/friendships.repo", () => ({
  insertFriendship: vi.fn(),
  listFriendIds: vi.fn(),
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
  listCoMemberIds: vi.fn(),
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

import { findUserByEmail } from "@/server/auth/repo/users.repo";
import { listCoMemberIds } from "@/server/group/repo/groups.repo";
import { insertFriendship } from "@/server/social/repo/friendships.repo";
import { addFriend } from "./social.usecase";

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
  vi.mocked(listCoMemberIds).mockResolvedValue([]);
});

describe("addFriend contact lookup", () => {
  it("returns the same denial for a missing and an unrelated account", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(undefined);
    const missing = addFriend(CALLER, { email: TARGET_EMAIL, phone: "" });
    await expect(missing).rejects.toMatchObject({
      code: "permission_denied",
      message: "you can only add someone you share a group with",
    });

    vi.mocked(findUserByEmail).mockResolvedValue(targetRow);
    const unrelated = addFriend(CALLER, { email: TARGET_EMAIL, phone: "" });
    await expect(unrelated).rejects.toMatchObject({
      code: "permission_denied",
      message: "you can only add someone you share a group with",
    });
    expect(insertFriendship).not.toHaveBeenCalled();
  });

  it("allows contact lookup only for an existing co-member", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(targetRow);
    vi.mocked(listCoMemberIds).mockResolvedValue([TARGET]);

    const result = await addFriend(CALLER, { email: TARGET_EMAIL, phone: "" });

    expect(insertFriendship).toHaveBeenCalledWith(CALLER, TARGET);
    expect(result.id).toBe(TARGET);
  });
});
