/** Regression tests for how a receipt upload is measured, routed and given decode slots before it is unpacked. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { sharpMock, sharpMetadataMock, sharpToBufferMock, transcodeHeicMock } = vi.hoisted(() => ({
  sharpMock: vi.fn(),
  sharpMetadataMock: vi.fn(),
  sharpToBufferMock: vi.fn(),
  transcodeHeicMock: vi.fn(),
}));

vi.mock("sharp", () => ({ default: Object.assign(sharpMock, { cache: vi.fn() }) }));
vi.mock("@/server/receipt/usecase/image/heicTranscode", () => ({ transcodeHeic: transcodeHeicMock }));
vi.mock("@/server/receipt/repo/receiptScans.repo", () => ({ insertReceiptScan: vi.fn(async () => undefined) }));

import { MAX_IMAGE_PIXELS } from "@/server/receipt/receipt.constants";
import { scanReceipt } from "./receipt.usecase";

/** What a JPEG off a phone's camera reports in its header. */
const ORDINARY_PHOTO = { width: 4032, height: 3024, channels: 3, depth: "uchar" };

/** A JPEG's first bytes, which is what the mocked transcoders hand back. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * Parses as the server does for a signed-in person, with the scan count
 * written nowhere.
 *
 * @param image - The uploaded bytes.
 * @param currency - The expense's currency.
 * @returns What scanReceipt returns.
 */
function parseAsSomeone(image: Uint8Array, currency?: string) {
  return scanReceipt("user-scanning", image, currency);
}

/** Returns enough PNG signature bytes for the server's format detector. */
function pngBytes(): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
}

/** Returns a RIFF header carrying the requested four-byte container brand. */
function riffBytes(brand: "AVI " | "WEBP"): Uint8Array {
  return Uint8Array.from([
    0x52, 0x49, 0x46, 0x46,
    0, 0, 0, 0,
    ...brand.split("").map((character) => character.charCodeAt(0)),
  ]);
}

/** Returns a minimal HEIC brand header for the server's format detector. */
function heicBytes(): Uint8Array {
  return Uint8Array.from([
    0, 0, 0, 0,
    0x66, 0x74, 0x79, 0x70,
    0x68, 0x65, 0x69, 0x63,
  ]);
}

/**
 * A promise the test settles when it chooses, for holding a decode open.
 *
 * @returns The promise and the function that settles it.
 */
function heldOpen(): { promise: Promise<Buffer>; finish: () => void } {
  let finish = () => {};
  const promise = new Promise<Buffer>((resolve) => { finish = () => resolve(JPEG); });
  return { promise, finish };
}

beforeEach(() => {
  vi.clearAllMocks();
  sharpToBufferMock.mockReset();
  transcodeHeicMock.mockReset();
  process.env.RECEIPT_AI_PROVIDERS = "mock";
  const pipeline = {
    metadata: sharpMetadataMock,
    rotate: vi.fn(),
    resize: vi.fn(),
    jpeg: vi.fn(),
    toBuffer: sharpToBufferMock,
  };
  pipeline.rotate.mockReturnValue(pipeline);
  pipeline.resize.mockReturnValue(pipeline);
  pipeline.jpeg.mockReturnValue(pipeline);
  sharpMetadataMock.mockResolvedValue(ORDINARY_PHOTO);
  sharpToBufferMock.mockResolvedValue(JPEG);
  transcodeHeicMock.mockResolvedValue(JPEG);
  sharpMock.mockReturnValue(pipeline);
});

describe("receipt image formats", () => {
  it("requires the WEBP brand instead of accepting every RIFF container", async () => {
    await expect(parseAsSomeone(riffBytes("AVI "))).rejects.toThrow(/isn't a supported image/);

    expect(sharpMock).not.toHaveBeenCalled();
  });

  it("accepts a RIFF container that carries the WEBP brand", async () => {
    await parseAsSomeone(riffBytes("WEBP"));

    expect(sharpToBufferMock).toHaveBeenCalledOnce();
  });

  it("sends a HEIC to its own worker and never to sharp", async () => {
    await parseAsSomeone(heicBytes());

    expect(transcodeHeicMock).toHaveBeenCalledOnce();
    expect(sharpMock).not.toHaveBeenCalled();
  });
});

describe("receipt image decode budget", () => {
  it("passes the explicit pixel ceiling to sharp for ordinary images", async () => {
    await parseAsSomeone(pngBytes());

    expect(sharpMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ limitInputPixels: MAX_IMAGE_PIXELS }),
    );
  });

  it("refuses an image whose header says it unpacks to more than the budget, before decoding", async () => {
    // 8000 × 5000 at 16 bits with transparency: 305 MiB from a 465 KB file.
    sharpMetadataMock.mockResolvedValue({ width: 8000, height: 5000, channels: 4, depth: "ushort" });

    await expect(parseAsSomeone(pngBytes())).rejects.toThrow(/far more detail than a receipt needs/);
    expect(sharpToBufferMock).not.toHaveBeenCalled();
  });

  it("refuses an image over the pixel ceiling from its header", async () => {
    sharpMetadataMock.mockResolvedValue({ width: 10_000, height: 5_000, channels: 3, depth: "uchar" });

    await expect(parseAsSomeone(pngBytes())).rejects.toThrow(/over 40 megapixels/);
    expect(sharpToBufferMock).not.toHaveBeenCalled();
  });

  it("counts a sample format it does not know as the largest", async () => {
    // 9 MP is small at one byte a sample and far over the budget at sixteen.
    sharpMetadataMock.mockResolvedValue({ width: 3000, height: 3000, channels: 4, depth: "something-new" });

    await expect(parseAsSomeone(pngBytes())).rejects.toThrow(/far more detail/);
  });

  it("words an unreadable header for the person, not the decoder", async () => {
    sharpMetadataMock.mockRejectedValue(new Error("pngload: libspng read error"));

    await expect(parseAsSomeone(pngBytes())).rejects.toThrow(/could not read that image/);
  });
});

describe("receipt image decode slots", () => {
  it("decodes two ordinary images at once", async () => {
    const first = heldOpen();
    const second = heldOpen();
    sharpToBufferMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const parses = [parseAsSomeone(pngBytes()), parseAsSomeone(pngBytes())];

    await vi.waitFor(() => expect(sharpToBufferMock).toHaveBeenCalledTimes(2));
    first.finish();
    second.finish();
    await Promise.all(parses);
  });

  it("starts a HEIC only once no other image is decoding", async () => {
    const ordinary = heldOpen();
    sharpToBufferMock.mockReturnValueOnce(ordinary.promise);

    const ordinaryParse = parseAsSomeone(pngBytes());
    await vi.waitFor(() => expect(sharpToBufferMock).toHaveBeenCalledOnce());
    const heicParse = parseAsSomeone(heicBytes());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(transcodeHeicMock).not.toHaveBeenCalled();
    ordinary.finish();
    await ordinaryParse;
    await vi.waitFor(() => expect(transcodeHeicMock).toHaveBeenCalledOnce());
    await heicParse;
  });

  it("decodes nothing else while a HEIC is decoding", async () => {
    const heic = heldOpen();
    transcodeHeicMock.mockReturnValueOnce(heic.promise);

    const heicParse = parseAsSomeone(heicBytes());
    await vi.waitFor(() => expect(transcodeHeicMock).toHaveBeenCalledOnce());
    const ordinaryParse = parseAsSomeone(pngBytes());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(sharpToBufferMock).not.toHaveBeenCalled();
    heic.finish();
    await heicParse;
    await vi.waitFor(() => expect(sharpToBufferMock).toHaveBeenCalledOnce());
    await ordinaryParse;
  });
});
