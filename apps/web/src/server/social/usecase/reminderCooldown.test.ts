/** Regression tests for cheap reminder guards running before ledger computation. */

import type { PoolClient } from "pg";
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
vi.mock("@/server/payment/repo/paymentMethods.repo", () => ({
  listPaymentMethodsByUser: vi.fn(),
}));
const { transactionClient } = vi.hoisted(() => ({ transactionClient: {} as PoolClient }));
vi.mock("@/server/common/ledger/ledgerLocks", () => ({
  lockReminder: vi.fn(),
  withLedgerTransaction: vi.fn(
    (operation: (client: PoolClient) => Promise<unknown>) => operation(transactionClient),
  ),
}));

import { findUserById } from "@/server/auth/repo/users.repo";
import {
  findLatestNotificationAt,
  insertNotifications,
} from "@/server/social/repo/notifications.repo";
import { netWithUser } from "@/server/expense/usecase/balance.usecase";
import {
  listPaymentMethodsByUser,
  type PaymentMethodRow,
} from "@/server/payment/repo/paymentMethods.repo";
import { lockReminder } from "@/server/common/ledger/ledgerLocks";
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
    phone_verified_at: null,
    token_version: 0,
    created_at: "2026-08-01T00:00:00Z",
  };
}

/**
 * Builds one of the sender's stored payment methods.
 *
 * @param name - Method name.
 * @param currency - ISO 4217 code.
 * @param preferred - Whether it is starred.
 * @param value - The identifier a payer would use, which must never reach a notification.
 * @returns A payment method row owned by the sender.
 */
function methodRow(
  name: string,
  currency: string,
  preferred: boolean,
  value: string,
): PaymentMethodRow {
  return {
    id: `method-${name}`,
    user_id: SENDER_ID,
    name,
    currency,
    preset: null,
    note: "",
    is_preferred: preferred,
    preferred_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    details: [{ kind: "username", label: "", value }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findUserById).mockImplementation(async (userId) => userRow(userId));
  vi.mocked(findLatestNotificationAt).mockResolvedValue(undefined);
  vi.mocked(netWithUser).mockResolvedValue(new Map([["USD", 500]]));
  vi.mocked(insertNotifications).mockResolvedValue(undefined);
  vi.mocked(listPaymentMethodsByUser).mockResolvedValue([]);
});

describe("reminder cooldown ordering", () => {
  it("rejects an active cooldown without computing the ledger", async () => {
    vi.mocked(findLatestNotificationAt).mockResolvedValue(new Date().toISOString());

    await expect(sendReminder(SENDER_ID, DEBTOR_ID)).rejects.toThrow(/already reminded/);

    expect(findLatestNotificationAt).toHaveBeenCalledExactlyOnceWith(
      DEBTOR_ID,
      "reminder",
      `/friends/${SENDER_ID}`,
      undefined,
    );
    expect(netWithUser).not.toHaveBeenCalled();
    expect(lockReminder).not.toHaveBeenCalled();
    expect(insertNotifications).not.toHaveBeenCalled();
  });

  it("reads what they owe before the reminder's transaction, never while holding it", async () => {
    // Inside the transaction, the balance's own snapshot would take a second
    // connection while the first is held.
    await sendReminder(SENDER_ID, DEBTOR_ID);

    const ledgerOrder = vi.mocked(netWithUser).mock.invocationCallOrder[0];
    const lockOrder = vi.mocked(lockReminder).mock.invocationCallOrder[0];
    expect(ledgerOrder).toBeLessThan(lockOrder);
  });

  it("computes the balance only after the cooldown lookup passes", async () => {
    await sendReminder(SENDER_ID, DEBTOR_ID);

    const cooldownOrder = vi.mocked(findLatestNotificationAt).mock.invocationCallOrder[0];
    const ledgerOrder = vi.mocked(netWithUser).mock.invocationCallOrder[0];
    expect(cooldownOrder).toBeLessThan(ledgerOrder);
    expect(insertNotifications).toHaveBeenCalledTimes(1);
  });

  it("checks the cooldown again and inserts on one transaction, behind the pair's lock", async () => {
    // A check-then-insert across two connections lets concurrent sends all
    // pass the check. The early check only saves the ledger walk; the one
    // that counts runs after the lock, and every step after it rides the
    // same client.
    await sendReminder(SENDER_ID, DEBTOR_ID);

    expect(lockReminder).toHaveBeenCalledWith(transactionClient, SENDER_ID, DEBTOR_ID);
    const lockOrder = vi.mocked(lockReminder).mock.invocationCallOrder[0];
    const lockedCooldownOrder = vi.mocked(findLatestNotificationAt).mock.invocationCallOrder[1];
    expect(lockOrder).toBeLessThan(lockedCooldownOrder);
    expect(findLatestNotificationAt).toHaveBeenLastCalledWith(
      DEBTOR_ID,
      "reminder",
      `/friends/${SENDER_ID}`,
      transactionClient,
    );
    expect(insertNotifications).toHaveBeenCalledWith(
      [DEBTOR_ID],
      expect.objectContaining({ type: "reminder" }),
      transactionClient,
    );
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

  it("says only what is owed when the sender has no payment method", async () => {
    await sendReminder(SENDER_ID, DEBTOR_ID);
    const [, notification] = vi.mocked(insertNotifications).mock.calls[0];
    expect(notification.body).toBe("You owe $5.00");
  });

  it("names the sender's preferred method and never the identifier behind it", async () => {
    vi.mocked(listPaymentMethodsByUser).mockResolvedValue([
      methodRow("Venmo", "USD", false, "sender-venmo"),
      methodRow("Zelle", "USD", true, "sender@example.com"),
    ]);

    await sendReminder(SENDER_ID, DEBTOR_ID);

    // Read on the reminder's own transaction, like every other step.
    expect(listPaymentMethodsByUser).toHaveBeenCalledWith(SENDER_ID, transactionClient);
    const [, notification] = vi.mocked(insertNotifications).mock.calls[0];
    expect(notification.body).toBe("You owe $5.00. Sender prefers Zelle.");
    // A notification is a stored row: the handle must not be copied into it.
    expect(notification.body).not.toContain("sender@example.com");
    expect(notification.body).not.toContain("sender-venmo");
  });

  it("names a method only for a currency that is actually owed", async () => {
    vi.mocked(netWithUser).mockResolvedValue(
      new Map([
        ["USD", 500],
        ["EUR", -700],
      ]),
    );
    vi.mocked(listPaymentMethodsByUser).mockResolvedValue([
      methodRow("Wise", "EUR", true, "sender-wise"),
      methodRow("Zelle", "USD", false, "sender@example.com"),
    ]);

    await sendReminder(SENDER_ID, DEBTOR_ID);

    const [, notification] = vi.mocked(insertNotifications).mock.calls[0];
    expect(notification.body).toBe("You owe $5.00. Sender takes Zelle.");
  });

  it("refuses when the only positive position is in a currency they are owed in", async () => {
    vi.mocked(netWithUser).mockResolvedValue(new Map([["EUR", -700]]));
    await expect(sendReminder(SENDER_ID, DEBTOR_ID)).rejects.toThrow(/don't owe you anything/);
  });
});
