/** Tests that every PushService method authenticates, rate-limits where it should, and delegates. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerContext } from "@connectrpc/connect";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireRateLimitedUser: vi.fn(),
  registerDevice: vi.fn(),
  listDevices: vi.fn(),
  removeDevice: vi.fn(),
  sendTestPush: vi.fn(),
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));

vi.mock("@/server/api/connect/context", () => ({
  requireUser: mocks.requireUser,
  runUsecase: vi.fn((operation: () => Promise<unknown>) => operation()),
  sessionTokenVersion: () => 7,
}));
vi.mock("@/server/api/connect/rpcRateLimit", () => ({
  requireRateLimitedUser: mocks.requireRateLimitedUser,
  RPC_RATE_LIMITS: { registerDevice: 10, sendTestPush: 3, updatePushPreferences: 30 },
}));
vi.mock("@/server/push/usecase/devices/devices.usecase", () => ({
  registerDevice: mocks.registerDevice,
  listDevices: mocks.listDevices,
  removeDevice: mocks.removeDevice,
  sendTestPush: mocks.sendTestPush,
}));
vi.mock("@/server/push/usecase/preferences/preferences.usecase", () => ({
  getPreferences: mocks.getPreferences,
  updatePreferences: mocks.updatePreferences,
}));

import { pushHandler } from "./handler";

const context = {} as HandlerContext;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue("user-a");
  mocks.requireRateLimitedUser.mockResolvedValue("user-a");
});

describe("pushHandler", () => {
  it("rate-limits registration and binds it to the session's token version", async () => {
    const request = { expoPushToken: "t", installationId: "i", platform: "ios", label: "", appVersion: "" };
    await pushHandler.registerDevice(request as never, context);
    expect(mocks.requireRateLimitedUser).toHaveBeenCalledWith(context, "register-device", 10);
    expect(mocks.registerDevice).toHaveBeenCalledWith("user-a", 7, request);
  });

  it("rate-limits test pushes", async () => {
    await pushHandler.sendTestPush({ deviceId: "dev-1" } as never, context);
    expect(mocks.requireRateLimitedUser).toHaveBeenCalledWith(context, "send-test-push", 3);
    expect(mocks.sendTestPush).toHaveBeenCalledWith("user-a", "dev-1");
  });

  it("rate-limits preference writes", async () => {
    await pushHandler.updatePreferences({ expenses: true } as never, context);
    expect(mocks.requireRateLimitedUser).toHaveBeenCalledWith(context, "update-push-preferences", 30);
  });

  it("authenticates the reads and removal", async () => {
    await pushHandler.listDevices({} as never, context);
    await pushHandler.getPreferences({} as never, context);
    await pushHandler.removeDevice({ deviceId: "dev-1", signingOut: true } as never, context);
    expect(mocks.requireUser).toHaveBeenCalledTimes(3);
    expect(mocks.removeDevice).toHaveBeenCalledWith("user-a", "dev-1", true);
  });

  it("refuses an unauthenticated caller before any usecase runs", async () => {
    mocks.requireUser.mockRejectedValue(new Error("session expired"));
    await expect(pushHandler.listDevices({} as never, context)).rejects.toThrow("session expired");
    expect(mocks.listDevices).not.toHaveBeenCalled();
  });
});
