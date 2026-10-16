/** Tests for reading delivery receipts and forgetting phones that are gone. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  deletePushDevicesById: vi.fn(),
  deleteStalePushDevices: vi.fn(),
  deleteExpiredPushTickets: vi.fn(),
  deletePushTickets: vi.fn(),
  listPushTicketsDue: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("@/server/push/repo/pushDevices.repo", () => ({
  deletePushDevicesById: repo.deletePushDevicesById,
  deleteStalePushDevices: repo.deleteStalePushDevices,
}));
vi.mock("@/server/push/repo/pushTickets.repo", () => ({
  deleteExpiredPushTickets: repo.deleteExpiredPushTickets,
  deletePushTickets: repo.deletePushTickets,
  listPushTicketsDue: repo.listPushTicketsDue,
}));
vi.mock("@/server/common/logger", () => ({ logEvent: repo.logEvent, logError: vi.fn() }));

import { checkPushReceipts } from "./receipts.usecase";
import type { PushProvider, PushReceipt } from "@/server/push/usecase/provider/pushTypes";
import { PUSH_DEVICE_STALE_DAYS, PUSH_TICKET_MAX_AGE_HOURS } from "@/server/push/push.constants";

/**
 * A provider that returns fixed receipts.
 *
 * @param receipts - Receipts by ticket id.
 * @returns The provider.
 */
function provider(receipts: Record<string, PushReceipt>): PushProvider {
  return { name: "test", send: vi.fn(), receipts: vi.fn(async () => receipts) };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.listPushTicketsDue.mockResolvedValue([
    { ticket_id: "t-ok", device_id: "dev-1", created_at: "" },
    { ticket_id: "t-gone", device_id: "dev-2", created_at: "" },
    { ticket_id: "t-error", device_id: "dev-3", created_at: "" },
    { ticket_id: "t-pending", device_id: "dev-4", created_at: "" },
  ]);
});

describe("checkPushReceipts", () => {
  it("prunes expired tickets and long-unseen phones every pass", async () => {
    repo.listPushTicketsDue.mockResolvedValue([]);
    await checkPushReceipts(provider({}));
    expect(repo.deleteExpiredPushTickets).toHaveBeenCalledWith(PUSH_TICKET_MAX_AGE_HOURS);
    expect(repo.deleteStalePushDevices).toHaveBeenCalledWith(PUSH_DEVICE_STALE_DAYS);
  });

  it("deletes a phone whose receipt says the app is gone, and keeps unready tickets", async () => {
    const report = await checkPushReceipts(
      provider({
        "t-ok": { status: "ok" },
        "t-gone": { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
        "t-error": { status: "error", message: "apns hiccup", details: { error: "ProviderError" } },
      }),
    );
    expect(repo.deletePushDevicesById).toHaveBeenCalledWith(["dev-2"]);
    expect(repo.deletePushTickets).toHaveBeenCalledWith(["t-ok", "t-gone", "t-error"]);
    expect(report).toEqual({ checked: 3, removedDevices: 1, failed: 1 });
    expect(repo.logEvent).toHaveBeenCalledWith("warn", "push receipt error", expect.objectContaining({ ticketId: "t-error" }));
  });
});
