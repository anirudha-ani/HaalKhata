/** Reads real image headers with sharp and checks what the decode budget lets through, without decoding anything. */

import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { UsecaseError } from "@/server/common/errors";
import { MAX_DECODED_IMAGE_BYTES } from "@/server/receipt/receipt.constants";
import { assertDecodeFits, fitsPixelCeiling } from "./decodeBudget";

/** PNG colour types: 2 is RGB, 6 is RGB with transparency. */
const PNG_RGB = 2;
const PNG_RGBA = 6;

/**
 * One PNG chunk: length, type, data and checksum.
 *
 * @param type - Four-letter chunk type.
 * @param data - Chunk contents.
 * @returns The encoded chunk.
 */
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/**
 * A PNG that claims any size but carries almost no pixel data: what a hostile
 * upload looks like, and small enough to build in a test.
 *
 * @param width - Claimed width.
 * @param height - Claimed height.
 * @param bitDepth - Bits per sample, 8 or 16.
 * @param colourType - {@link PNG_RGB} or {@link PNG_RGBA}.
 * @returns The PNG bytes.
 */
function pngClaiming(width: number, height: number, bitDepth: number, colourType: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = colourType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.alloc(64))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("assertDecodeFits", () => {
  it("refuses a small file that unpacks to 16-bit pixels with transparency, from its header", async () => {
    const hostile = pngClaiming(8000, 5000, 16, PNG_RGBA);
    expect(hostile.length).toBeLessThan(100);
    expect(8000 * 5000 * 4 * 2).toBeGreaterThan(MAX_DECODED_IMAGE_BYTES);

    const refusal = assertDecodeFits(hostile);

    await expect(refusal).rejects.toBeInstanceOf(UsecaseError);
    await expect(refusal).rejects.toThrow(/far more detail than a receipt needs/);
  });

  it("lets an ordinary 24 MP colour photo through", async () => {
    await expect(assertDecodeFits(pngClaiming(5712, 4284, 8, PNG_RGB))).resolves.toBeUndefined();
  });

  it("lets a 24 MP photo with transparency through", async () => {
    await expect(assertDecodeFits(pngClaiming(5712, 4284, 8, PNG_RGBA))).resolves.toBeUndefined();
  });

  it("refuses more pixels than the ceiling whatever their depth", async () => {
    await expect(assertDecodeFits(pngClaiming(10_000, 5_000, 8, PNG_RGB))).rejects.toThrow(/over 40 megapixels/);
  });

  it("leaves a header it cannot read for the caller to word", async () => {
    const failure = assertDecodeFits(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    await expect(failure).rejects.toThrow();
    await expect(failure).rejects.not.toBeInstanceOf(UsecaseError);
  });
});

describe("fitsPixelCeiling", () => {
  it("compares without overflowing on sizes a file chose", () => {
    expect(fitsPixelCeiling(8000, 5000, 40_000_000)).toBe(true);
    expect(fitsPixelCeiling(8001, 5000, 40_000_000)).toBe(false);
    expect(fitsPixelCeiling(2 ** 31, 2 ** 31, 40_000_000)).toBe(false);
    expect(fitsPixelCeiling(0, 10, 40_000_000)).toBe(false);
    expect(fitsPixelCeiling(Number.NaN, 10, 40_000_000)).toBe(false);
  });
});
