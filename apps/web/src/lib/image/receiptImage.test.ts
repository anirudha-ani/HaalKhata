/** Unit tests for the pure parts of the pre-upload image shrink. */

import { describe, expect, it } from "vitest";
import { isHeic, scaledSize, shouldResize } from "@/lib/image/receiptImage";
import { MAX_UPLOAD_EDGE_PIXELS, SKIP_RESIZE_BELOW_BYTES } from "@/lib/image/image.constants";

/**
 * Builds a File stand-in with a chosen size, which the browser File
 * constructor cannot fake without allocating that many bytes.
 *
 * @param name - File name.
 * @param type - MIME type.
 * @param size - Reported byte size.
 * @returns An object shaped like the parts of File these helpers read.
 */
function fileLike(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

describe("scaledSize", () => {
  it("shrinks a phone photo to the longest edge we actually send", () => {
    expect(scaledSize({ width: 4032, height: 3024 }, 2576)).toEqual({
      width: 2576,
      height: 1932,
    });
  });

  it("scales by the longest edge whichever way the photo is turned", () => {
    expect(scaledSize({ width: 3024, height: 4032 }, 2576)).toEqual({
      width: 1932,
      height: 2576,
    });
  });

  it("leaves an image that already fits alone rather than re-encoding it", () => {
    expect(scaledSize({ width: 1200, height: 900 }, 2576)).toBeNull();
    expect(scaledSize({ width: 2576, height: 100 }, 2576)).toBeNull();
  });

  it("never enlarges", () => {
    expect(scaledSize({ width: 200, height: 200 }, 2576)).toBeNull();
  });

  it("keeps a sliver of an image at least one pixel tall", () => {
    // A 4000x3 panorama scaled by 2576/4000 rounds the height to 2, not 0 —
    // a zero-height canvas throws on drawImage.
    const target = scaledSize({ width: 4000, height: 3 }, 2576);
    expect(target?.height).toBeGreaterThanOrEqual(1);
  });

  it("survives a degenerate zero-size image", () => {
    expect(scaledSize({ width: 0, height: 0 }, 2576)).toBeNull();
  });
});

describe("isHeic", () => {
  it("catches what an iPhone actually sends, by type or by extension", () => {
    expect(isHeic(fileLike("IMG_1.HEIC", "", 1))).toBe(true);
    expect(isHeic(fileLike("x", "image/heic", 1))).toBe(true);
    expect(isHeic(fileLike("x", "image/heif", 1))).toBe(true);
  });

  it("does not catch ordinary photos", () => {
    expect(isHeic(fileLike("a.jpg", "image/jpeg", 1))).toBe(false);
    expect(isHeic(fileLike("a.png", "image/png", 1))).toBe(false);
  });
});

describe("shouldResize", () => {
  it("takes on a big JPEG", () => {
    expect(shouldResize(fileLike("a.jpg", "image/jpeg", 6_000_000))).toBe(true);
  });

  it("leaves HEIC alone — no browser can decode it", () => {
    expect(shouldResize(fileLike("a.heic", "image/heic", 6_000_000))).toBe(false);
  });

  it("leaves an already-small file alone", () => {
    expect(shouldResize(fileLike("a.jpg", "image/jpeg", SKIP_RESIZE_BELOW_BYTES))).toBe(false);
  });

  it("uses an edge the server will not shrink further", () => {
    // If this drifts above the server's own ceiling the upload carries pixels
    // that get discarded on arrival, which is the whole thing being avoided.
    expect(MAX_UPLOAD_EDGE_PIXELS).toBe(2576);
  });
});
