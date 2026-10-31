/** Unit tests for telling a HEIC apart before preparing a receipt photo. */

import { describe, expect, it } from "vitest";
import { isHeic } from "@/lib/image/receiptImage";

/**
 * Builds a File stand-in, which the browser File constructor would make
 * this test allocate.
 *
 * @param name - File name.
 * @param type - MIME type.
 * @returns An object shaped like the parts of File these helpers read.
 */
function fileLike(name: string, type: string): File {
  return { name, type, size: 1 } as File;
}

/**
 * The first bytes of a HEIF file with the given brand.
 *
 * @param brand - Four-letter brand at offset 8.
 * @returns The header bytes.
 */
function heifHeader(brand: string): Uint8Array {
  return Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((letter) => letter.charCodeAt(0))]);
}

describe("isHeic", () => {
  it("catches what an iPhone actually sends, by type or by extension", () => {
    const empty = new Uint8Array(0);
    expect(isHeic(fileLike("IMG_1.HEIC", ""), empty)).toBe(true);
    expect(isHeic(fileLike("x", "image/heic"), empty)).toBe(true);
    expect(isHeic(fileLike("x", "image/heif"), empty)).toBe(true);
  });

  it("catches a HEIC with no type and the wrong name from its bytes", () => {
    expect(isHeic(fileLike("receipt.jpg", ""), heifHeader("heic"))).toBe(true);
    expect(isHeic(fileLike("receipt", ""), heifHeader("mif1"))).toBe(true);
  });

  it("does not catch ordinary photos or other ISO media files", () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    expect(isHeic(fileLike("a.jpg", "image/jpeg"), jpeg)).toBe(false);
    expect(isHeic(fileLike("a.png", "image/png"), new Uint8Array(0))).toBe(false);
    expect(isHeic(fileLike("clip.mp4", "video/mp4"), heifHeader("isom"))).toBe(false);
  });
});
