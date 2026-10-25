/** Concurrency tests for the receipt parsing transport guard. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Code, type HandlerContext } from "@connectrpc/connect";
import type { ParseReceiptRequest } from "@haalkhata/protogen/receipt/v1/receipt_pb";

vi.mock("@/server/receipt/usecase/receiptConsent.usecase", () => ({ parseReceiptWithConsent: vi.fn(), receiptProcessingInfo: vi.fn() }));
vi.mock("@/server/api/connect/context", () => ({
  runUsecase: vi.fn((operation: () => Promise<unknown>) => operation()),
}));
vi.mock("@/server/api/connect/rpcRateLimit", () => ({
  MAX_CONCURRENT_RECEIPT_PARSES: 2,
  RPC_RATE_LIMITS: { parseReceipt: 5 },
  requireRateLimitedUser: vi.fn().mockResolvedValue("user-123"),
}));

import { parseReceiptWithConsent as parseReceipt } from "@/server/receipt/usecase/receiptConsent.usecase";
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

  it("hands the usecase the caller, so the attempt is counted against them", async () => {
    vi.mocked(parseReceipt).mockResolvedValue({} as never);
    const image = new Uint8Array([1, 2, 3]);
    const request = { image, consentVersion: "terms", currency: "EUR" } as ParseReceiptRequest;

    await receiptHandler.parseReceipt(request, {} as HandlerContext);

    expect(parseReceipt).toHaveBeenCalledWith("user-123", image, "terms", "EUR");
  });
});
