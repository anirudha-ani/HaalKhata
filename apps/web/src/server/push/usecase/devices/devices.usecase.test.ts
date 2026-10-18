/** Tests for registering, removing and testing the caller's phones. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushDeviceRow } from "@/server/push/repo/pushDevices.repo";

const repo = vi.hoisted(() => ({
  transaction: vi.fn(async (operation: (client: unknown) => Promise<unknown>) => operation({})),
  upsertPushDevice: vi.fn(),
  evictOldestPushDevices: vi.fn(),
  listLivePushDevices: vi.fn(),
  findLivePushDevice: vi.fn(),
  deletePushDevice: vi.fn(),
  deletePushDevicesHoldingTokens: vi.fn(),
  markPushDevicesSent: vi.fn(),
  insertPushTickets: vi.fn(),
  countUnreadByUsers: vi.fn(),
}));

vi.mock("@/server/common/db/db", () => ({ transaction: repo.transaction }));
vi.mock("@/server/push/repo/pushDevices.repo", () => ({
  upsertPushDevice: repo.upsertPushDevice,
  evictOldestPushDevices: repo.evictOldestPushDevices,
  listLivePushDevices: repo.listLivePushDevices,
  findLivePushDevice: repo.findLivePushDevice,
  deletePushDevice: repo.deletePushDevice,
  deletePushDevicesHoldingTokens: repo.deletePushDevicesHoldingTokens,
  markPushDevicesSent: repo.markPushDevicesSent,
}));
vi.mock("@/server/push/repo/pushTickets.repo", () => ({ insertPushTickets: repo.insertPushTickets }));
vi.mock("@/server/social/repo/notifications.repo", () => ({ countUnreadByUsers: repo.countUnreadByUsers }));

import { registerDevice, removeDevice, sendTestPush } from "./devices.usecase";
import { MAX_PUSH_DEVICES_PER_USER } from "@/server/push/push.constants";
import { PushTransportError, type PushProvider, type PushTicket } from "@/server/push/usecase/provider/pushTypes";

const VALID = {
  expoPushToken: "ExponentPushToken[abcdefghijklmnopqrstuv]",
  installationId: "6f1c2a4e-0b7d-4c1e-9a3f-2d5b8e7c1a90",
  platform: "ios",
  label: "iPhone 17",
  appVersion: "1.1.0",
};

const STORED: PushDeviceRow = {
  id: "dev-1",
  user_id: "user-a",
  installation_id: VALID.installationId,
  expo_token: VALID.expoPushToken,
  platform: "ios",
  label: "iPhone 17",
  app_version: "1.1.0",
  token_version: 3,
  created_at: "2026-10-16T00:00:00.000Z",
  last_seen_at: "2026-10-16T00:00:00.000Z",
  last_sent_at: null,
};

/**
 * A provider that returns one fixed ticket, or fails.
 *
 * @param answer - The ticket, or an error to throw.
 * @returns The provider.
 */
function provider(answer: PushTicket | Error): PushProvider {
  return {
    name: "test",
    send: vi.fn(async () => {
      if (answer instanceof Error) throw answer;
      return [answer];
    }),
    receipts: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.upsertPushDevice.mockResolvedValue(STORED);
  repo.findLivePushDevice.mockResolvedValue(STORED);
  repo.countUnreadByUsers.mockResolvedValue(new Map([["user-a", 5]]));
});

describe("registerDevice", () => {
  it("stores the phone under the caller's current session version and trims the list", async () => {
    const device = await registerDevice("user-a", 3, VALID);
    expect(repo.upsertPushDevice).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-a", tokenVersion: 3, expoToken: VALID.expoPushToken }),
      expect.anything(),
    );
    expect(repo.evictOldestPushDevices).toHaveBeenCalledWith("user-a", MAX_PUSH_DEVICES_PER_USER, expect.anything());
    expect(device).not.toHaveProperty("expoToken");
    expect(JSON.stringify(device)).not.toContain("ExponentPushToken");
  });

  it.each([
    ["a token that is not Expo's", { expoPushToken: "abc" }],
    ["a malformed installation id", { installationId: "../../etc" }],
    ["an unknown platform", { platform: "web" }],
    ["a label that is far too long", { label: "x".repeat(10_000) }],
  ])("refuses %s", async (_case, override) => {
    await expect(registerDevice("user-a", 3, { ...VALID, ...override })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.upsertPushDevice).not.toHaveBeenCalled();
  });

  it("removes invisible characters from the label", async () => {
    await registerDevice("user-a", 3, { ...VALID, label: "i​Phone\u0007 17" });
    expect(repo.upsertPushDevice).toHaveBeenCalledWith(expect.objectContaining({ label: "iPhone 17" }), expect.anything());
  });

  it("refuses a session that was signed out between authentication and the write", async () => {
    repo.upsertPushDevice.mockResolvedValue(undefined);
    await expect(registerDevice("user-a", 3, VALID)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(repo.evictOldestPushDevices).not.toHaveBeenCalled();
  });

  it("refuses a request without a session version", async () => {
    await expect(registerDevice("user-a", Number.NaN, VALID)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(repo.upsertPushDevice).not.toHaveBeenCalled();
  });
});

describe("removeDevice", () => {
  it("reports a phone that is not the caller's", async () => {
    repo.deletePushDevice.mockResolvedValue(false);
    await expect(removeDevice("user-a", "dev-9")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("sendTestPush", () => {
  it("sends to the phone, records the ticket and carries the unread badge", async () => {
    const service = provider({ status: "ok", id: "ticket-1" });
    await sendTestPush("user-a", "dev-1", service);
    expect(service.send).toHaveBeenCalledWith([
      expect.objectContaining({ to: VALID.expoPushToken, badge: 5, data: expect.objectContaining({ link: "/account" }) }),
    ]);
    expect(repo.insertPushTickets).toHaveBeenCalledWith([
      { ticketId: "ticket-1", deviceId: "dev-1", expoToken: VALID.expoPushToken },
    ]);
    expect(repo.markPushDevicesSent).toHaveBeenCalledWith(["dev-1"]);
  });

  it("refuses a phone that is not the caller's", async () => {
    repo.findLivePushDevice.mockResolvedValue(undefined);
    await expect(sendTestPush("user-a", "dev-9", provider({ status: "ok", id: "t" }))).rejects.toMatchObject({ code: "not_found" });
  });

  it("forgets a phone that no longer has the app and says so", async () => {
    const service = provider({ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } });
    await expect(sendTestPush("user-a", "dev-1", service)).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringContaining("isn't reachable"),
    });
    expect(repo.deletePushDevicesHoldingTokens).toHaveBeenCalledWith([
      { deviceId: "dev-1", expoToken: VALID.expoPushToken },
    ]);
  });

  it("reports an unreachable service as unavailable", async () => {
    await expect(
      sendTestPush("user-a", "dev-1", provider(new PushTransportError("expo request failed", true))),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
