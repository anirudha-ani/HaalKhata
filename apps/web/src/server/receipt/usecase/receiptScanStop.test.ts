/** A scan that stops hangs up on the provider at once and is not counted as a failed scan; a provider that gives up by itself still is an outage. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jpegWith } from "./image/testing/jpegSegments";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/server/receipt/receipt.constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/receipt/receipt.constants")>()),
  COMPATIBLE_AI: { baseUrl: "https://provider.test/v1", apiKey: "", model: "test-model", zeroDataRetention: false },
}));
vi.mock("@/server/receipt/repo/receiptScans.repo", () => ({ insertReceiptScan: vi.fn(async () => undefined) }));
vi.mock("@/server/common/logger", () => ({ logError: vi.fn(), logEvent: vi.fn() }));

import { UsecaseError } from "@/server/common/errors";
import { insertReceiptScan } from "@/server/receipt/repo/receiptScans.repo";
import { RECEIPT_SCAN_REPLACED_MESSAGE } from "@/server/receipt/receipt.constants";
import { scanReceipt } from "./receipt.usecase";

/**
 * A provider call that never answers by itself and fails the way fetch does
 * when its signal aborts.
 *
 * @param _url - Ignored.
 * @param init - The request, with its signal.
 * @returns A response promise that only ever rejects.
 */
function hangUntilAborted(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RECEIPT_AI_PROVIDERS = "compatible";
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a scan that stops", () => {
  it("hangs up on the provider, ends with its reason and is not counted", async () => {
    fetchMock.mockImplementation(hangUntilAborted);
    const stop = new AbortController();
    const scanning = scanReceipt("user-scanning", jpegWith({ width: 1200, height: 1600 }), "USD", stop.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    stop.abort(new UsecaseError("aborted", RECEIPT_SCAN_REPLACED_MESSAGE));

    await expect(scanning).rejects.toMatchObject({ code: "aborted", message: RECEIPT_SCAN_REPLACED_MESSAGE });
    const providerSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal!;
    expect(providerSignal.aborted).toBe(true);
    expect(insertReceiptScan).not.toHaveBeenCalled();
  });

  it("is told apart from a provider that runs out of time by itself, which is an outage and counted", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));

    await expect(
      scanReceipt("user-scanning", jpegWith({ width: 1200, height: 1600 }), "USD", new AbortController().signal),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(insertReceiptScan).toHaveBeenCalledWith("user-scanning", "failed");
  });
});
