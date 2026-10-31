/** Regression tests for what a receipt scan accepts as a photo: only one prepared on the device, forwarded without its metadata. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RECEIPT_IMAGE_BYTES } from "@haalkhata/shared/receipt/receipt.constants";
import { EXIF_SEGMENT, JFIF_SEGMENT, containsBytes, jpegWith } from "./image/testing/jpegSegments";

vi.mock("@/server/receipt/repo/receiptScans.repo", () => ({ insertReceiptScan: vi.fn(async () => undefined) }));

import { scanReceipt } from "./receipt.usecase";

/**
 * Parses as the server does for a signed-in person, with the scan count
 * written nowhere.
 *
 * @param image - The uploaded bytes.
 * @returns What scanReceipt returns.
 */
function parseAsSomeone(image: Uint8Array) {
  return scanReceipt("user-scanning", image, "USD");
}

beforeEach(() => {
  process.env.RECEIPT_AI_PROVIDERS = "mock";
});

describe("receipt photo upload", () => {
  it("reads a prepared photo and hands back exactly the bytes the provider was shown", async () => {
    const photo = jpegWith({ width: 1932, height: 2576 });

    const result = await parseAsSomeone(photo);

    expect(result.receipt.items.length).toBeGreaterThan(0);
    expect([...result.normalizedImage]).toEqual([...photo]);
  });

  it("forwards a photo without its EXIF, so where it was taken goes nowhere", async () => {
    const photo = jpegWith({ width: 1200, height: 1600, before: [JFIF_SEGMENT, EXIF_SEGMENT] });

    const result = await parseAsSomeone(photo);

    expect(containsBytes(result.normalizedImage, new TextEncoder().encode("GPS-SECRET"))).toBe(false);
  });

  it("refuses a photo the app did not prepare: full size, HEIC or PNG", async () => {
    const heic = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0]);
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    for (const image of [jpegWith({ width: 8064, height: 6048 }), heic, pngBytes]) {
      await expect(parseAsSomeone(image)).rejects.toMatchObject({
        code: "invalid_argument",
        message: expect.stringMatching(/wasn't prepared for upload/),
      });
    }
  });

  it("refuses more bytes than the standard allows before reading any of them", async () => {
    const oversized = new Uint8Array(MAX_RECEIPT_IMAGE_BYTES + 1);

    await expect(parseAsSomeone(oversized)).rejects.toThrow(/too large/);
  });

  it("refuses an empty upload", async () => {
    await expect(parseAsSomeone(new Uint8Array(0))).rejects.toThrow(/no image provided/);
  });
});
