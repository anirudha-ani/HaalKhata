/** Unit tests for the EXIF orientation reader, against bytes a real encoder produced. */

import { describe, expect, it } from "vitest";
import { orientationTransform, readJpegOrientation } from "@/lib/image/exifOrientation";
import { EXIF_JPEG_FIXTURES } from "@/lib/image/exifFixtures";

/**
 * Decodes one of the base64 JPEG fixtures.
 *
 * @param name - Fixture key: an orientation value, or "none".
 * @returns The JPEG bytes.
 */
function fixture(name: string): Uint8Array {
  return Uint8Array.from(Buffer.from(EXIF_JPEG_FIXTURES[name], "base64"));
}

describe("readJpegOrientation", () => {
  it("reads the tag out of real encoder output", () => {
    // Fixtures come from sharp, not from bytes assembled by hand to match the
    // parser — otherwise the test only proves the parser agrees with itself.
    expect(readJpegOrientation(fixture("1"))).toBe(1);
    expect(readJpegOrientation(fixture("3"))).toBe(3);
    expect(readJpegOrientation(fixture("6"))).toBe(6);
    expect(readJpegOrientation(fixture("8"))).toBe(8);
  });

  it("falls back to upright when the JPEG carries no EXIF at all", () => {
    expect(readJpegOrientation(fixture("none"))).toBe(1);
  });

  it("does not throw on input that is not a JPEG", () => {
    expect(readJpegOrientation(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(readJpegOrientation(new Uint8Array(0))).toBe(1);
    expect(readJpegOrientation(Uint8Array.from([0xff, 0xd8]))).toBe(1);
  });

  it("does not run off the end of a truncated file", () => {
    // A partially-read header must never throw: this runs on a photo the user
    // just picked, and an exception would take the whole upload down with it.
    // The answer at a given cut is not pinned — sharp writes orientation as
    // the first IFD entry, so it is legitimately readable from ~36 bytes in,
    // and recovering it early is correct, not a leak. What matters is that
    // every truncation yields a usable orientation.
    const full = fixture("6");
    for (let length = 0; length <= 64; length += 1) {
      const head = full.slice(0, length);
      expect(() => readJpegOrientation(head)).not.toThrow();
      const value = readJpegOrientation(head);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(8);
    }
  });

  it("reports upright while the tag is still beyond the bytes read", () => {
    const full = fixture("6");
    // Before the TIFF header is even complete there is nothing to find.
    expect(readJpegOrientation(full.slice(0, 20))).toBe(1);
  });
});

describe("orientationTransform", () => {
  it("leaves an upright photo alone", () => {
    expect(orientationTransform(1)).toEqual({ swapsAxes: false, rotate: 0, mirrored: false });
  });

  it("turns the common portrait case a quarter clockwise", () => {
    // 6 is what a phone held upright writes, and the one that matters most.
    expect(orientationTransform(6)).toEqual({ swapsAxes: true, rotate: 90, mirrored: false });
  });

  it("swaps the axes for every quarter turn and no others", () => {
    const swapping = [1, 2, 3, 4, 5, 6, 7, 8].filter(
      (value) => orientationTransform(value).swapsAxes,
    );
    expect(swapping).toEqual([5, 6, 7, 8]);
  });

  it("treats an out-of-range value as upright rather than throwing", () => {
    expect(orientationTransform(0).rotate).toBe(0);
    expect(orientationTransform(99).rotate).toBe(0);
    expect(orientationTransform(-1).rotate).toBe(0);
  });
});
