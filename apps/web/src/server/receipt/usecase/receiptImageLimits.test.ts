/** Regression tests for decoded-pixel and HEIC allocation limits. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { sharpMock, sharpToBufferMock, heicDecodeAllMock, heicImageDecodeMock, disposeMock } = vi.hoisted(() => ({
  sharpMock: vi.fn(),
  sharpToBufferMock: vi.fn(),
  heicDecodeAllMock: vi.fn(),
  heicImageDecodeMock: vi.fn(),
  disposeMock: vi.fn(),
}));

vi.mock("sharp", () => ({ default: sharpMock }));
vi.mock("heic-decode", () => ({
  default: Object.assign(vi.fn(), { all: heicDecodeAllMock }),
}));

import { MAX_IMAGE_PIXELS } from "@/server/receipt/receipt.constants";
import { parseReceipt } from "./receipt.usecase";

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

beforeEach(() => {
  vi.clearAllMocks();
  heicDecodeAllMock.mockReset();
  sharpToBufferMock.mockReset();
  process.env.RECEIPT_AI_PROVIDERS = "mock";
  const pipeline = {
    rotate: vi.fn(),
    resize: vi.fn(),
    jpeg: vi.fn(),
    toBuffer: sharpToBufferMock,
  };
  pipeline.rotate.mockReturnValue(pipeline);
  pipeline.resize.mockReturnValue(pipeline);
  pipeline.jpeg.mockReturnValue(pipeline);
  sharpToBufferMock.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]));
  sharpMock.mockReturnValue(pipeline);
});

describe("receipt image decode limits", () => {
  it("requires the WEBP brand instead of accepting every RIFF container", async () => {
    await expect(parseReceipt(riffBytes("AVI "))).rejects.toThrow(/isn't a supported image/);

    expect(sharpMock).not.toHaveBeenCalled();
  });

  it("accepts a RIFF container that carries the WEBP brand", async () => {
    await parseReceipt(riffBytes("WEBP"));

    expect(sharpMock).toHaveBeenCalledOnce();
  });

  it("passes the explicit pixel ceiling to Sharp for ordinary images", async () => {
    await parseReceipt(pngBytes());

    expect(sharpMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ limitInputPixels: MAX_IMAGE_PIXELS }),
    );
  });

  it("rejects oversized HEIC metadata before allocating its pixel buffer", async () => {
    const images = Object.assign(
      [{ width: 10_000, height: 5_000, decode: heicImageDecodeMock }],
      { dispose: disposeMock },
    );
    heicDecodeAllMock.mockResolvedValue(images);

    await expect(parseReceipt(heicBytes())).rejects.toThrow(/40000000-pixel limit/);
    expect(heicImageDecodeMock).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledOnce();
    expect(sharpMock).not.toHaveBeenCalled();
  });

  it("holds the HEIC slot until Sharp releases the raw pixel buffer", async () => {
    const decoded = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255]),
    };
    const firstImages = Object.assign(
      [{ width: 1, height: 1, decode: vi.fn().mockResolvedValue(decoded) }],
      { dispose: vi.fn() },
    );
    const secondImages = Object.assign(
      [{ width: 1, height: 1, decode: vi.fn().mockResolvedValue(decoded) }],
      { dispose: vi.fn() },
    );
    heicDecodeAllMock
      .mockResolvedValueOnce(firstImages)
      .mockResolvedValueOnce(secondImages);
    let releaseFirstTranscode: ((jpeg: Buffer) => void) | undefined;
    sharpToBufferMock
      .mockImplementationOnce(
        () => new Promise<Buffer>((resolve) => { releaseFirstTranscode = resolve; }),
      )
      .mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]));

    const firstParse = parseReceipt(heicBytes());
    await vi.waitFor(() => expect(sharpToBufferMock).toHaveBeenCalledOnce());
    const secondParse = parseReceipt(heicBytes());
    await Promise.resolve();

    expect(heicDecodeAllMock).toHaveBeenCalledOnce();
    releaseFirstTranscode?.(Buffer.from([0xff, 0xd8, 0xff]));
    await firstParse;
    await vi.waitFor(() => expect(heicDecodeAllMock).toHaveBeenCalledTimes(2));
    await secondParse;
  });
});
