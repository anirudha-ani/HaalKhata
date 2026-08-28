/** Concurrency tests for the receipt parsing transport guard. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Code, type HandlerContext } from "@connectrpc/connect";
import type { ParseReceiptRequest } from "@haalkhata/protogen/receipt/v1/receipt_pb";

vi.mock("@/server/receipt/usecase/receipt.usecase", () => ({ parseReceipt: vi.fn() }));
vi.mock("@/server/api/connect/context", () => ({
  runUsecase: vi.fn((operation: () => Promise<unknown>) => operation()),
}));
vi.mock("@/server/api/connect/rpcRateLimit", () => ({
  MAX_CONCURRENT_RECEIPT_PARSES: 2,
  RPC_RATE_LIMITS: { parseReceipt: 5 },
  requireRateLimitedUser: vi.fn().mockResolvedValue("user-123"),
}));

import { parseReceipt } from "@/server/receipt/usecase/receipt.usecase";
import { receiptHandler } from "./handler";

beforeEach(() => vi.clearAllMocks());

describe("receipt handler concurrency", () => {
  it("rejects work above the process-wide provider limit", async () => {
    const releases: Array<() => void> = [];
    vi.mocked(parseReceipt).mockImplementation(
      () => new Promise((resolve) => releases.push(() => resolve({} as never))),
    );
    const context = {} as HandlerContext;
    const request = { image: new Uint8Array() } as ParseReceiptRequest;

    const first = receiptHandler.parseReceipt(request, context);
    const second = receiptHandler.parseReceipt(request, context);
    await vi.waitFor(() => expect(parseReceipt).toHaveBeenCalledTimes(2));

    await expect(
      receiptHandler.parseReceipt(request, context),
    ).rejects.toMatchObject({ code: Code.ResourceExhausted });

    for (const release of releases) release();
    await Promise.all([first, second]);
  });
});
