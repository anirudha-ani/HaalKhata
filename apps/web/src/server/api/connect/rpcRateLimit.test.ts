/** Unit tests for per-account authenticated RPC rate-limit keys. */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/api/connect/context", () => ({ requireUser: vi.fn() }));
vi.mock("@/server/common/rateLimit", () => ({ rateLimitCheck: vi.fn() }));

import { Code, type HandlerContext } from "@connectrpc/connect";
import { requireUser } from "@/server/api/connect/context";
import { rateLimitCheck } from "@/server/common/rateLimit";
import { requireRateLimitedUser } from "./rpcRateLimit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue("user-123");
});

describe("requireRateLimitedUser", () => {
  it("keys the limiter by operation and authenticated account", async () => {
    vi.mocked(rateLimitCheck).mockReturnValue(true);

    await expect(
      requireRateLimitedUser({} as HandlerContext, "parse-receipt", 5),
    ).resolves.toBe("user-123");
    expect(rateLimitCheck).toHaveBeenCalledWith("rpc:parse-receipt:user-123", 5);
  });

  it("rejects an exhausted account with ResourceExhausted", async () => {
    vi.mocked(rateLimitCheck).mockReturnValue(false);

    await expect(
      requireRateLimitedUser({} as HandlerContext, "parse-receipt", 5),
    ).rejects.toMatchObject({ code: Code.ResourceExhausted });
  });
});
