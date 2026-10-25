/** Transport tests for the personal analytics handler: who it runs as and which bucket it charges. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerContext } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { GetInsightsRequestSchema } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";

vi.mock("@/server/personalanalytics/usecase/insights.usecase", () => ({ getInsights: vi.fn() }));
vi.mock("@/server/api/connect/context", () => ({
  runUsecase: vi.fn((operation: () => Promise<unknown>) => operation()),
}));
vi.mock("@/server/api/connect/rpcRateLimit", () => ({
  RPC_RATE_LIMITS: { getInsights: 30 },
  requireRateLimitedUser: vi.fn().mockResolvedValue("user-123"),
}));

import { requireRateLimitedUser } from "@/server/api/connect/rpcRateLimit";
import { getInsights } from "@/server/personalanalytics/usecase/insights.usecase";
import { personalAnalyticsHandler } from "./handler";

beforeEach(() => vi.clearAllMocks());

describe("personal analytics handler", () => {
  it("answers about the authenticated caller, never an id from the request", async () => {
    vi.mocked(getInsights).mockResolvedValue({} as never);
    const context = {} as HandlerContext;

    await personalAnalyticsHandler.getInsights(
      create(GetInsightsRequestSchema, { months: 12, localMonth: "2026-10" }),
      context,
    );

    expect(requireRateLimitedUser).toHaveBeenCalledWith(context, "get-insights", 30);
    expect(getInsights).toHaveBeenCalledWith("user-123", { months: 12, localMonth: "2026-10" });
  });

  it("does not reach the ledger when the caller is over their limit", async () => {
    vi.mocked(requireRateLimitedUser).mockRejectedValueOnce(new Error("too many requests"));

    await expect(
      personalAnalyticsHandler.getInsights(create(GetInsightsRequestSchema), {} as HandlerContext),
    ).rejects.toThrow("too many requests");
    expect(getInsights).not.toHaveBeenCalled();
  });
});
