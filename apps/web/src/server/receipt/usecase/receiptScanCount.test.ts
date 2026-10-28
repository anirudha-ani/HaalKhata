/** Tests that a scan attempt is counted by outcome, and that counting can never change the scan's result. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sharpMock, fetchMock } = vi.hoisted(() => ({
  sharpMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("sharp", () => ({ default: Object.assign(sharpMock, { cache: vi.fn() }) }));
vi.mock("@/server/receipt/receipt.constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/receipt/receipt.constants")>()),
  COMPATIBLE_AI: {
    baseUrl: "https://provider.test/v1",
    apiKey: "",
    model: "test-model",
    zeroDataRetention: false,
  },
}));
vi.mock("@/server/receipt/repo/receiptScans.repo", () => ({ insertReceiptScan: vi.fn() }));
vi.mock("@/server/common/logger", () => ({ logError: vi.fn(), logEvent: vi.fn() }));

import { logError } from "@/server/common/logger";
import { insertReceiptScan } from "@/server/receipt/repo/receiptScans.repo";
import { scanReceipt } from "./receipt.usecase";

/** Returns enough JPEG signature bytes for the server's format detector. */
function jpegBytes(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff]);
}

/** Builds a successful chat-completions response whose model text is `content`. */
function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

/** A model answer with one readable line item. */
const ONE_ITEM =
  '{"merchant":"Corner Cafe","items":[{"name":"Bagel","quantity":1,"unit_price_cents":700,"total_cents":700}],"total_cents":700}';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RECEIPT_AI_PROVIDERS = "compatible";
  vi.stubGlobal("fetch", fetchMock);
  const pipeline = { metadata: vi.fn(), rotate: vi.fn(), resize: vi.fn(), jpeg: vi.fn(), toBuffer: vi.fn() };
  pipeline.metadata.mockResolvedValue({ width: 1200, height: 1600, channels: 3, depth: "uchar" });
  pipeline.rotate.mockReturnValue(pipeline);
  pipeline.resize.mockReturnValue(pipeline);
  pipeline.jpeg.mockReturnValue(pipeline);
  pipeline.toBuffer.mockResolvedValue(Buffer.from(jpegBytes()));
  sharpMock.mockReturnValue(pipeline);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("receipt scan counting", () => {
  it("counts a scan the provider read as parsed", async () => {
    fetchMock.mockResolvedValue(completion(ONE_ITEM));

    const parsed = await scanReceipt("user-1", jpegBytes());

    expect(parsed.receipt.items).toHaveLength(1);
    expect(insertReceiptScan).toHaveBeenCalledExactlyOnceWith("user-1", "parsed");
  });

  it("does not count a request refused before any provider saw it", async () => {
    await expect(scanReceipt("user-1", new Uint8Array())).rejects.toMatchObject({
      code: "invalid_argument",
      message: "no image provided",
    });
    await expect(scanReceipt("user-1", Uint8Array.from([1, 2, 3]))).rejects.toMatchObject({
      code: "invalid_argument",
    });
    await expect(scanReceipt("user-1", jpegBytes(), "XYZ")).rejects.toMatchObject({
      message: "unsupported receipt currency",
    });
    process.env.RECEIPT_AI_PROVIDERS = "nonexistent";
    await expect(scanReceipt("user-1", jpegBytes())).rejects.toMatchObject({
      code: "invalid_argument",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(insertReceiptScan).not.toHaveBeenCalled();
  });

  it("counts a photo a provider read and found nothing on as failed", async () => {
    fetchMock.mockResolvedValue(completion('{"merchant":"","items":[],"total_cents":0}'));

    await expect(scanReceipt("user-1", jpegBytes())).rejects.toMatchObject({
      code: "invalid_argument",
    });

    expect(insertReceiptScan).toHaveBeenCalledExactlyOnceWith("user-1", "failed");
  });

  it("counts a provider outage as failed", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(scanReceipt("user-1", jpegBytes())).rejects.toMatchObject({
      code: "unavailable",
    });

    expect(insertReceiptScan).toHaveBeenCalledExactlyOnceWith("user-1", "failed");
  });

  it("returns the scan when the counter cannot be written", async () => {
    fetchMock.mockResolvedValue(completion(ONE_ITEM));
    vi.mocked(insertReceiptScan).mockRejectedValue(new Error("connection refused"));

    const parsed = await scanReceipt("user-1", jpegBytes());

    expect(parsed.receipt.merchant).toBe("Corner Cafe");
    await vi.waitFor(() =>
      expect(logError).toHaveBeenCalledWith(expect.any(Error), { scope: "receipt-scan-count" }),
    );
  });

  it("answers without waiting for the count to be written", async () => {
    fetchMock.mockResolvedValue(completion(ONE_ITEM));
    vi.mocked(insertReceiptScan).mockReturnValue(new Promise<void>(() => undefined));

    const parsed = await scanReceipt("user-1", jpegBytes());

    expect(parsed.receipt.merchant).toBe("Corner Cafe");
    expect(insertReceiptScan).toHaveBeenCalledExactlyOnceWith("user-1", "parsed");
  });

  it("keeps the scan's own error when the counter also fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    vi.mocked(insertReceiptScan).mockRejectedValue(new Error("connection refused"));

    await expect(scanReceipt("user-1", jpegBytes())).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});
