/** Regression tests for cheap reminder guards running before ledger computation. */

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

import { findUserById } from "@/server/auth/repo/users.repo";
import {
  findLatestNotificationAt,
  insertNotifications,
} from "@/server/social/repo/notifications.repo";
import { netWithUser } from "@/server/expense/usecase/balance.usecase";
import { sendReminder } from "./social.usecase";

const SENDER_ID = "user-sender";
const DEBTOR_ID = "user-debtor";

/**
 * Builds the user row needed by reminder formatting.
 *
 * @param userId - Id of the fixture user.
 * @returns A complete persisted user row.
 */
function userRow(userId: string): UserRow {
  return {
    id: userId,
    email: `${userId}@example.com`,
    name: userId === SENDER_ID ? "Sender User" : "Debtor User",
    avatar_color: "#123456",
    avatar_url: null,
    default_currency: "USD",
    password_hash: null,
    phone: null,
    google_sub: `google-${userId}`,
    onboarded_at: null,
    merged_into: null,
    token_version: 0,
    created_at: "2026-08-01T00:00:00Z",
    payment_handles: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockImplementation(async (userId) => userRow(userId));
  vi.mocked(findLatestNotificationAt).mockResolvedValue(undefined);
  vi.mocked(netWithUser).mockResolvedValue(new Map([["USD", 500]]));
  vi.mocked(insertNotifications).mockResolvedValue(undefined);
});

describe("reminder cooldown ordering", () => {
  it("rejects an active cooldown without computing the ledger", async () => {
    vi.mocked(findLatestNotificationAt).mockResolvedValue(new Date().toISOString());

    await expect(sendReminder(SENDER_ID, DEBTOR_ID)).rejects.toThrow(/already reminded/);

    expect(findLatestNotificationAt).toHaveBeenCalledWith(
      DEBTOR_ID,
      "reminder",
      `/friends/${SENDER_ID}`,
    );
    expect(netWithUser).not.toHaveBeenCalled();
    expect(insertNotifications).not.toHaveBeenCalled();
  });

  it("computes the balance only after the cooldown lookup passes", async () => {
    await sendReminder(SENDER_ID, DEBTOR_ID);

    const cooldownOrder = vi.mocked(findLatestNotificationAt).mock.invocationCallOrder[0];
    const ledgerOrder = vi.mocked(netWithUser).mock.invocationCallOrder[0];
    expect(cooldownOrder).toBeLessThan(ledgerOrder);
    expect(insertNotifications).toHaveBeenCalledTimes(1);
  });

  it("names every currency owed, and never nets one against another", async () => {
    // They owe 500 USD and are owed 700 EUR: the dollar debt stands on its
    // own, and the nudge says exactly what is owed in what.
    vi.mocked(netWithUser).mockResolvedValue(
      new Map([
        ["USD", 500],
        ["EUR", -700],
      ]),
    );
    await sendReminder(SENDER_ID, DEBTOR_ID);
    const [, notification] = vi.mocked(insertNotifications).mock.calls[0];
    expect(notification.body).toMatch(/5\.00/);
    expect(notification.body).not.toMatch(/7\.00/);
  });

  it("refuses when the only positive position is in a currency they are owed in", async () => {
    vi.mocked(netWithUser).mockResolvedValue(new Map([["EUR", -700]]));
    await expect(sendReminder(SENDER_ID, DEBTOR_ID)).rejects.toThrow(/don't owe you anything/);
  });
});
