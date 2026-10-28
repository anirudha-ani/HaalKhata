/** Runs the real HEIC worker on real HEIC files: it converts a photo, and refuses one over the pixel ceiling before decoding it. */

import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { UsecaseError } from "@/server/common/errors";
import { MAX_HEIC_PIXELS } from "@/server/receipt/receipt.constants";
import { transcodeHeic } from "./heicTranscode";

/**
 * Reads a HEIC file kept beside these tests.
 *
 * @param name - File name in `fixtures/`.
 * @returns Its bytes.
 */
function fixture(name: string): Uint8Array {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
}

describe("transcodeHeic", () => {
  it("turns a HEIC photo into a JPEG of the same size", async () => {
    const jpeg = await transcodeHeic(fixture("receipt-480x360.heic"));

    expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const { width, height, format } = await sharp(jpeg).metadata();
    expect({ width, height, format }).toEqual({ width: 480, height: 360, format: "jpeg" });
  });

  it("refuses a photo over the pixel ceiling without decoding it", async () => {
    // 6000 × 4200 is 25.2 MP, just over the ceiling; the file is a blank page
    // of a few kilobytes, which is the point.
    expect(6000 * 4200).toBeGreaterThan(MAX_HEIC_PIXELS);

    const refusal = transcodeHeic(fixture("blank-6000x4200.heic"));

    await expect(refusal).rejects.toBeInstanceOf(UsecaseError);
    await expect(refusal).rejects.toThrow(/over 25 megapixels/);
  });

  it("reports bytes that are not a HEIF file as unreadable rather than refused", async () => {
    const failure = transcodeHeic(Uint8Array.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]));

    await expect(failure).rejects.toThrow();
    await expect(failure).rejects.not.toBeInstanceOf(UsecaseError);
  });

  it("converts photos one after another, each in its own worker", async () => {
    const image = fixture("receipt-480x360.heic");

    const jpegs = await Promise.all([transcodeHeic(image), transcodeHeic(image)]);

    for (const jpeg of jpegs) expect([...jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });
});
