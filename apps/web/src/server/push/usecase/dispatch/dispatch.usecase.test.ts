/** Tests for one dispatcher pass: what is sent, recorded, retried, dropped and forgotten. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimedPushRow } from "@/server/push/repo/pushOutbox.repo";
import type { PushDeviceRow } from "@/server/push/repo/pushDevices.repo";

const repo = vi.hoisted(() => ({
  claimDuePushes: vi.fn(),
  completePushes: vi.fn(),
  reschedulePushes: vi.fn(),
  deleteDeadPushDevicesForUsers: vi.fn(),
  deletePushDevicesById: vi.fn(),
  listLivePushDevicesForUsers: vi.fn(),
  markPushDevicesSent: vi.fn(),
  listPushPreferences: vi.fn(),
  insertPushTickets: vi.fn(),
  countUnreadByUsers: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("@/server/push/repo/pushOutbox.repo", () => ({
  claimDuePushes: repo.claimDuePushes,
  completePushes: repo.completePushes,
  reschedulePushes: repo.reschedulePushes,
}));
vi.mock("@/server/push/repo/pushDevices.repo", () => ({
  deleteDeadPushDevicesForUsers: repo.deleteDeadPushDevicesForUsers,
  deletePushDevicesById: repo.deletePushDevicesById,
  listLivePushDevicesForUsers: repo.listLivePushDevicesForUsers,
  markPushDevicesSent: repo.markPushDevicesSent,
}));
vi.mock("@/server/push/repo/pushPreferences.repo", () => ({ listPushPreferences: repo.listPushPreferences }));
vi.mock("@/server/push/repo/pushTickets.repo", () => ({ insertPushTickets: repo.insertPushTickets }));
vi.mock("@/server/social/repo/notifications.repo", () => ({ countUnreadByUsers: repo.countUnreadByUsers }));
vi.mock("@/server/common/logger", () => ({ logEvent: repo.logEvent, logError: vi.fn() }));

import { drainPushOutbox } from "./dispatch.usecase";
import { PushTransportError, type PushProvider, type PushTicket } from "@/server/push/usecase/provider/pushTypes";

const CLOCK_MS = Date.parse("2026-10-16T12:00:00.000Z");

/**
 * A claimed row for user-b.
 *
 * @param identifier - Notification id.
 * @param attempts - Claims so far.
 * @returns The row.
 */
function claimed(identifier: string, attempts = 1): ClaimedPushRow {
  return {
    notification_id: identifier,
    user_id: "user-b",
    attempts,
    queued_at: new Date(CLOCK_MS - 1_000).toISOString(),
    type: "expense_added",
    title: 'Ani added "Dinner"',
    body: "Goa trip",
    link: "/expenses/exp-1",
    actor_id: "user-a",
    expense_group_id: "grp-1",
    recent_from_actor: 1,
  };
}

/**
 * One of user-b's phones.
 *
 * @param identifier - Device id.
 * @returns The row.
 */
function phone(identifier: string): PushDeviceRow {
  return {
    id: identifier,
    user_id: "user-b",
    installation_id: `install-${identifier}`,
    expo_token: `ExponentPushToken[${identifier}]`,
    platform: "ios",
    label: "iPhone",
    app_version: "1.1.0",
    token_version: 0,
    created_at: "2026-10-01T00:00:00.000Z",
    last_seen_at: "2026-10-16T00:00:00.000Z",
    last_sent_at: null,
  };
}

/**
 * A provider that answers with fixed tickets, or fails.
 *
 * @param answer - Tickets to return, or an error to throw.
 * @returns The provider and its send spy.
 */
function provider(answer: PushTicket[] | Error): PushProvider & { send: ReturnType<typeof vi.fn> } {
  return {
    name: "test",
    send: vi.fn(async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    }),
    receipts: vi.fn(async () => ({})),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.claimDuePushes.mockResolvedValue([claimed("note-1")]);
  repo.listLivePushDevicesForUsers.mockResolvedValue([phone("dev-1")]);
  repo.listPushPreferences.mockResolvedValue([]);
  repo.countUnreadByUsers.mockResolvedValue(new Map([["user-b", 2]]));
});

describe("drainPushOutbox", () => {
  it("does nothing else when no row is due", async () => {
    repo.claimDuePushes.mockResolvedValue([]);
    const report = await drainPushOutbox(provider([]), CLOCK_MS);
    expect(report.claimed).toBe(0);
    expect(repo.listLivePushDevicesForUsers).not.toHaveBeenCalled();
  });

  it("sends, records the ticket, stamps the phone and finishes the row", async () => {
    const service = provider([{ status: "ok", id: "ticket-1" }]);
    const report = await drainPushOutbox(service, CLOCK_MS);
    expect(service.send).toHaveBeenCalledOnce();
    expect(repo.deleteDeadPushDevicesForUsers).toHaveBeenCalledWith(["user-b"]);
    expect(repo.insertPushTickets).toHaveBeenCalledWith([{ ticketId: "ticket-1", deviceId: "dev-1" }]);
    expect(repo.markPushDevicesSent).toHaveBeenCalledWith(["dev-1"]);
    expect(repo.completePushes).toHaveBeenCalledWith(["note-1"]);
    expect(repo.reschedulePushes).toHaveBeenCalledWith([]);
    expect(report).toMatchObject({ claimed: 1, sent: 1, retried: 0, dropped: 0 });
  });

  it("forgets a phone the service says no longer has the app", async () => {
    const service = provider([
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
    ]);
    await drainPushOutbox(service, CLOCK_MS);
    expect(repo.deletePushDevicesById).toHaveBeenCalledWith(["dev-1"]);
    expect(repo.completePushes).toHaveBeenCalledWith(["note-1"]);
    expect(repo.reschedulePushes).toHaveBeenCalledWith([]);
  });

  it("retries a row the service could not take yet, with backoff and the reason", async () => {
    const service = provider([
      { status: "error", message: "slow down", details: { error: "MessageRateExceeded" } },
    ]);
    const report = await drainPushOutbox(service, CLOCK_MS);
    expect(repo.reschedulePushes).toHaveBeenCalledWith([
      { notificationId: "note-1", delaySeconds: 30, error: "MessageRateExceeded: slow down" },
    ]);
    expect(repo.completePushes).toHaveBeenCalledWith([]);
    expect(report.retried).toBe(1);
  });

  it("drops a message the service refuses as malformed instead of resending it", async () => {
    const service = provider([{ status: "error", message: "too big", details: { error: "MessageTooBig" } }]);
    const report = await drainPushOutbox(service, CLOCK_MS);
    expect(repo.completePushes).toHaveBeenCalledWith(["note-1"]);
    expect(report.dropped).toBe(1);
  });

  it("retries every row of a batch whose request failed transiently", async () => {
    repo.claimDuePushes.mockResolvedValue([claimed("note-1"), claimed("note-2")]);
    const report = await drainPushOutbox(provider(new PushTransportError("expo answered 503", true)), CLOCK_MS);
    expect(repo.reschedulePushes.mock.calls[0][0].map((retry: { notificationId: string }) => retry.notificationId)).toEqual([
      "note-1",
      "note-2",
    ]);
    expect(report.retried).toBe(2);
  });

  it("drops a batch the service refuses outright", async () => {
    const report = await drainPushOutbox(provider(new PushTransportError("expo answered 400", false)), CLOCK_MS);
    expect(repo.completePushes).toHaveBeenCalledWith(["note-1"]);
    expect(report.dropped).toBe(1);
  });

  it("gives up once the attempts run out", async () => {
    repo.claimDuePushes.mockResolvedValue([claimed("note-1", 5)]);
    const report = await drainPushOutbox(provider(new PushTransportError("expo answered 503", true)), CLOCK_MS);
    expect(repo.completePushes).toHaveBeenCalledWith(["note-1"]);
    expect(report.dropped).toBe(1);
    expect(repo.logEvent).toHaveBeenCalledWith("error", "push given up", expect.objectContaining({ notificationId: "note-1" }));
  });

  it("finishes a switched-off row without sending it", async () => {
    repo.listPushPreferences.mockResolvedValue([
      { user_id: "user-b", expenses: false, comments: true, payments: true, groups: true, friends: true },
    ]);
    const service = provider([]);
    const report = await drainPushOutbox(service, CLOCK_MS);
    expect(service.send).not.toHaveBeenCalled();
    expect(repo.completePushes).toHaveBeenCalledWith(["note-1"]);
    expect(report.skipped).toBe(1);
  });
});
