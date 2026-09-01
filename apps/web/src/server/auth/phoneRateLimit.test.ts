/** Unit tests for the durable destination- and client-keyed SMS send ceilings. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordPhoneSendMock } = vi.hoisted(() => ({ recordPhoneSendMock: vi.fn() }));

vi.mock("@/server/auth/usecase/auth.usecase", () => ({
  signPayload: vi.fn((purpose: string, value: string) => `${purpose}:${value}`),
}));
vi.mock("@/server/auth/repo/phoneVerifications.repo", () => ({
  recordPhoneSend: recordPhoneSendMock,
}));

import { Code } from "@connectrpc/connect";
import {
  PHONE_SEND_LIMIT_PER_DESTINATION_DAY,
  PHONE_SEND_LIMIT_PER_DESTINATION_HOUR,
  PHONE_SEND_LIMIT_PER_IP_HOUR,
} from "@/server/auth/auth.constants";
import { enforcePhoneSendLimits } from "./phoneRateLimit";

/** Window counts with every ceiling comfortably clear. */
const UNDER_EVERY_CEILING = { destinationHour: 1, destinationDay: 1, ipHour: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  recordPhoneSendMock.mockResolvedValue(UNDER_EVERY_CEILING);
});

describe("enforcePhoneSendLimits", () => {
  it("records the send under a keyed hash, never the raw number", async () => {
    await enforcePhoneSendLimits("+16175550100", "10.0.0.1");

    expect(recordPhoneSendMock).toHaveBeenCalledWith("rate-limit:+16175550100", "10.0.0.1");
    expect(recordPhoneSendMock.mock.calls[0][0]).not.toBe("+16175550100");
  });

  it("passes while every window count is at its ceiling", async () => {
    recordPhoneSendMock.mockResolvedValue({
      destinationHour: PHONE_SEND_LIMIT_PER_DESTINATION_HOUR,
      destinationDay: PHONE_SEND_LIMIT_PER_DESTINATION_DAY,
      ipHour: PHONE_SEND_LIMIT_PER_IP_HOUR,
    });

    await expect(enforcePhoneSendLimits("+16175550100", "10.0.0.1")).resolves.toBeUndefined();
  });

  it.each([
    ["hourly destination", { ...UNDER_EVERY_CEILING, destinationHour: PHONE_SEND_LIMIT_PER_DESTINATION_HOUR + 1 }],
    ["daily destination", { ...UNDER_EVERY_CEILING, destinationDay: PHONE_SEND_LIMIT_PER_DESTINATION_DAY + 1 }],
    ["client address", { ...UNDER_EVERY_CEILING, ipHour: PHONE_SEND_LIMIT_PER_IP_HOUR + 1 }],
  ])("refuses when the %s ceiling is exceeded", async (_ceiling, counts) => {
    // M-04: five accounts on five addresses used to be five times the
    // per-account allowance against one victim number; the ledger counts
    // across all of them, and survives restarts because it lives in Postgres.
    recordPhoneSendMock.mockResolvedValue(counts);

    await expect(enforcePhoneSendLimits("+16175550100", "10.0.0.1")).rejects.toMatchObject({
      code: Code.ResourceExhausted,
    });
  });
});
