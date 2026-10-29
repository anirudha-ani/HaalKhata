/** The receipt handler hands a scan to the usecase whole: who asked, the photo, and the request's signal to stop on. */

import { describe, expect, it, vi } from "vitest";
import type { HandlerContext } from "@connectrpc/connect";
import type { ParseReceiptRequest } from "@haalkhata/protogen/receipt/v1/receipt_pb";

vi.mock("@/server/receipt/usecase/receiptConsent.usecase", () => ({ parseReceiptWithConsent: vi.fn(), receiptProcessingInfo: vi.fn() }));
vi.mock("@/server/api/connect/context", () => ({
  requireUser: vi.fn().mockResolvedValue("user-123"),
  runUsecase: vi.fn((operation: () => Promise<unknown>) => operation()),
}));

import { parseReceiptWithConsent } from "@/server/receipt/usecase/receiptConsent.usecase";
import { receiptHandler } from "./handler";

describe("parseReceipt", () => {
  it("hands the usecase the caller, the photo and the request's signal", async () => {
    vi.mocked(parseReceiptWithConsent).mockResolvedValue({} as never);
    const image = new Uint8Array([1, 2, 3]);
    const request = { image, consentVersion: "terms", currency: "EUR" } as ParseReceiptRequest;
    const signal = new AbortController().signal;

    await receiptHandler.parseReceipt(request, { signal } as HandlerContext);

    expect(parseReceiptWithConsent).toHaveBeenCalledWith("user-123", image, "terms", "EUR", signal);
  });
});
