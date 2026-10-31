/**
 * What a scan costs a person's per-minute allowance: only a scan that gets
 * a lane spends one. Turned away as busy, or given up after waiting, costs
 * nothing; somebody out of scans is told at once instead of after waiting;
 * and a scan whose person leaves gives its lane to the next.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pendingScans } = vi.hoisted(() => ({
  pendingScans: [] as { userId: string; signal: AbortSignal; finish: () => void }[],
}));

vi.mock("../receipt.constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../receipt.constants")>()),
  // One lane and a line of one, so a third person finds scanning busy.
  RECEIPT_SCAN_LANES: 1,
  RECEIPT_SCAN_LINE_LENGTH: 1,
  RECEIPT_SCAN_LINE_WAIT_MS: 1000,
}));
vi.mock("../repo/receiptConsent.repo", () => ({ findReceiptConsent: vi.fn() }));
vi.mock("./receipt.usecase", async () => {
  const { scanStoppedError } = await import("./scanLanes/scanLanes");
  return {
    // A scan that runs until the test finishes it, and stops, as the real
    // one does, when its lane's signal aborts.
    scanReceipt: vi.fn(
      (userId: string, _image: Uint8Array, _currency: string, signal: AbortSignal) =>
        new Promise((resolve, reject) => {
          pendingScans.push({ userId, signal, finish: () => resolve({ receipt: {}, provider: "test" }) });
          signal.addEventListener("abort", () => reject(scanStoppedError(signal)), { once: true });
        }),
    ),
  };
});

import { findReceiptConsent } from "../repo/receiptConsent.repo";
import { RECEIPT_SCAN_BUSY_MESSAGE, RECEIPT_SCAN_RATE_MESSAGE, RECEIPT_SCANS_PER_MINUTE } from "../receipt.constants";
import { scanReceipt } from "./receipt.usecase";
import { parseReceiptWithConsent, receiptProcessingInfo } from "./receiptConsent.usecase";

/**
 * Starts a scan for a person who has allowed scanning.
 *
 * @param userId - Who is scanning.
 * @param request - Their request's controller; a fresh one by default.
 * @returns What parseReceiptWithConsent comes to.
 */
function scan(userId: string, request = new AbortController()) {
  return parseReceiptWithConsent(userId, new Uint8Array([1]), receiptProcessingInfo().consentVersion, "USD", request.signal);
}

/** Lets settled promises finish their hops through the microtask queue. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 10; tick++) await Promise.resolve();
}

/** Finishes every scan running now. */
async function finishRunning(): Promise<void> {
  for (const running of pendingScans.splice(0)) running.finish();
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(findReceiptConsent).mockResolvedValue(receiptProcessingInfo().consentVersion);
});

afterEach(async () => {
  await finishRunning();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("what a receipt scan costs", () => {
  it("costs nothing when scanning is busy, so the person can still scan as often as anyone", async () => {
    const anaScan = scan("busy-ana");
    await settle();
    const benScan = scan("busy-ben");
    await settle();

    await expect(scan("busy-cy")).rejects.toMatchObject({ code: "resource_exhausted", message: RECEIPT_SCAN_BUSY_MESSAGE });

    await finishRunning();
    await finishRunning();
    await Promise.all([anaScan, benScan]);
    for (let attempt = 0; attempt < RECEIPT_SCANS_PER_MINUTE; attempt++) {
      const cyScan = scan("busy-cy");
      await settle();
      await finishRunning();
      await expect(cyScan).resolves.toMatchObject({ provider: "test" });
    }
    await expect(scan("busy-cy")).rejects.toMatchObject({ code: "resource_exhausted", message: RECEIPT_SCAN_RATE_MESSAGE });
  });

  it("costs nothing when the wait for a lane runs out", async () => {
    const anaScan = scan("wait-ana");
    await settle();
    const benScan = scan("wait-ben").catch((error: unknown) => error);
    await settle();

    await vi.advanceTimersByTimeAsync(1000);

    expect(await benScan).toMatchObject({ code: "resource_exhausted", message: RECEIPT_SCAN_BUSY_MESSAGE });
    await finishRunning();
    await anaScan;
    expect(vi.mocked(scanReceipt).mock.calls.map(([userId]) => userId)).toEqual(["wait-ana"]);
  });

  it("tells somebody out of scans at once, without waiting in line", async () => {
    for (let attempt = 0; attempt < RECEIPT_SCANS_PER_MINUTE; attempt++) {
      const anaScan = scan("spent-ana");
      await settle();
      await finishRunning();
      await anaScan;
    }
    const benScan = scan("spent-ben");
    await settle();

    await expect(scan("spent-ana")).rejects.toMatchObject({ code: "resource_exhausted", message: RECEIPT_SCAN_RATE_MESSAGE });

    await finishRunning();
    await benScan;
  });

  it("gives the lane of a person who leaves to the next in line at once", async () => {
    const anaRequest = new AbortController();
    const anaScan = scan("leave-ana", anaRequest).catch((error: unknown) => error);
    await settle();
    const benScan = scan("leave-ben");
    await settle();
    expect(pendingScans.map((running) => running.userId)).toEqual(["leave-ana"]);

    anaRequest.abort();
    await settle();

    expect(await anaScan).toMatchObject({ code: "aborted" });
    expect(pendingScans.map((running) => running.userId)).toEqual(["leave-ana", "leave-ben"]);
    pendingScans.shift();
    await finishRunning();
    await expect(benScan).resolves.toMatchObject({ provider: "test" });
  });
});
