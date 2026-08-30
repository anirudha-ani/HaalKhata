/** Unit tests for destination- and client-keyed SMS send limits. */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/usecase/auth.usecase", () => ({
  signPayload: vi.fn((purpose: string, value: string) => `${purpose}:${value}`),
}));

import { Code } from "@connectrpc/connect";
import {
  PHONE_SEND_LIMIT_PER_DESTINATION_HOUR,
  PHONE_SEND_LIMIT_PER_IP_HOUR,
} from "@/server/auth/auth.constants";
import { enforcePhoneSendLimits } from "./phoneRateLimit";

describe("enforcePhoneSendLimits", () => {
  it("caps sends to one number across every account and address", () => {
    // M-04: five accounts on five addresses used to be five times the
    // per-account allowance against one victim number.
    for (let attempt = 0; attempt < PHONE_SEND_LIMIT_PER_DESTINATION_HOUR; attempt += 1) {
      expect(() => enforcePhoneSendLimits("+16175550100", `10.0.0.${attempt}`)).not.toThrow();
    }
    expect(() => enforcePhoneSendLimits("+16175550100", "10.0.0.99")).toThrowError(
      expect.objectContaining({ code: Code.ResourceExhausted }),
    );
    // A different number is a different bucket.
    expect(() => enforcePhoneSendLimits("+16175550101", "10.0.0.99")).not.toThrow();
  });

  it("caps verifications started from one client address", () => {
    for (let attempt = 0; attempt < PHONE_SEND_LIMIT_PER_IP_HOUR; attempt += 1) {
      expect(() =>
        enforcePhoneSendLimits(`+1617555${String(1000 + attempt)}`, "203.0.113.7"),
      ).not.toThrow();
    }
    expect(() => enforcePhoneSendLimits("+16175559999", "203.0.113.7")).toThrowError(
      expect.objectContaining({ code: Code.ResourceExhausted }),
    );
  });
});
