/** Tests for the upload check: what a prepared photo is, what is refused, and what is stripped before forwarding. */

import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_RECEIPT_IMAGE_EDGE_PIXELS } from "@haalkhata/shared/receipt/receipt.constants";
import { UsecaseError } from "@/server/common/errors";
import { acceptPreparedJpeg } from "./preparedJpeg";
import {
  COMMENT_SEGMENT,
  EXIF_SEGMENT,
  ICC_SEGMENT,
  JFIF_SEGMENT,
  SCAN_BYTES,
  concat,
  containsBytes,
  jpegWith,
  segment,
} from "./testing/jpegSegments";

/** The largest size the standard allows. */
const LONGEST = MAX_RECEIPT_IMAGE_EDGE_PIXELS;

/**
 * Runs the check and returns its refusal, failing the test if it accepted.
 *
 * @param image - Bytes to check.
 * @returns The thrown error.
 */
function refusal(image: Uint8Array): unknown {
  try {
    acceptPreparedJpeg(image);
  } catch (error) {
    return error;
  }
  throw new Error("expected the upload to be refused");
}

describe("acceptPreparedJpeg", () => {
  it("accepts a baseline or progressive JPEG at the largest size the standard allows", () => {
    for (const progressive of [false, true]) {
      const photo = jpegWith({ width: LONGEST, height: 1932, progressive });

      expect(acceptPreparedJpeg(photo)).toEqual(photo);
    }
  });

  it("refuses one pixel more on either side", () => {
    for (const size of [{ width: LONGEST + 1, height: 100 }, { width: 100, height: LONGEST + 1 }]) {
      const error = refusal(jpegWith(size));

      expect(error).toBeInstanceOf(UsecaseError);
      expect(String((error as Error).message)).toMatch(/wasn't prepared for upload/);
    }
  });

  it("refuses a full-size phone photo, which the apps shrink before upload", () => {
    expect(refusal(jpegWith({ width: 8064, height: 6048 }))).toBeInstanceOf(UsecaseError);
  });

  it("refuses anything that is not a JPEG", () => {
    const heic = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0]);
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    for (const image of [heic, pngBytes, new TextEncoder().encode("<svg/>"), new Uint8Array(0)]) {
      expect(refusal(image)).toBeInstanceOf(UsecaseError);
    }
  });

  it("refuses a JPEG that is cut short, has no frame before its scan, or has two frames", () => {
    const whole = jpegWith({ width: 100, height: 100 });
    const scanOnly = concat([Uint8Array.from([0xff, 0xd8]), segment(0xda, [1, 1, 0, 0, 0x3f, 0]), SCAN_BYTES, Uint8Array.from([0xff, 0xd9])]);
    const twoFrames = jpegWith({ width: 100, height: 100, before: [segment(0xc0, [8, 0, 10, 0, 10, 1, 1, 0x11, 0])] });
    const lyingLength = concat([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff]), Uint8Array.from([0xff, 0xd9])]);

    for (const image of [whole.subarray(0, whole.length - 2), whole.subarray(0, 40), scanOnly, twoFrames, lyingLength]) {
      expect(refusal(image)).toBeInstanceOf(UsecaseError);
    }
  });

  it("refuses a frame whose height is left for the scan to give", () => {
    expect(refusal(jpegWith({ width: 100, height: 0 }))).toBeInstanceOf(UsecaseError);
  });

  it("removes EXIF and comments, keeps the JFIF header and colour profile, and leaves the scan untouched", () => {
    const photo = jpegWith({ width: 1200, height: 1600, before: [JFIF_SEGMENT, EXIF_SEGMENT, ICC_SEGMENT, COMMENT_SEGMENT] });

    const forwarded = acceptPreparedJpeg(photo);

    expect(containsBytes(forwarded, EXIF_SEGMENT)).toBe(false);
    expect(containsBytes(forwarded, new TextEncoder().encode("GPS-SECRET"))).toBe(false);
    expect(containsBytes(forwarded, COMMENT_SEGMENT)).toBe(false);
    expect(containsBytes(forwarded, JFIF_SEGMENT)).toBe(true);
    expect(containsBytes(forwarded, ICC_SEGMENT)).toBe(true);
    expect(containsBytes(forwarded, SCAN_BYTES)).toBe(true);
    expect(forwarded.length).toBe(photo.length - EXIF_SEGMENT.length - COMMENT_SEGMENT.length);
  });

  it("strips the EXIF from a real JPEG and leaves a photo that still decodes", async () => {
    const real = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#f4efe6" } })
      .withExif({ IFD0: { Artist: "someone at home" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(real).metadata()).exif).toBeDefined();

    const forwarded = Buffer.from(acceptPreparedJpeg(real));

    const metadata = await sharp(forwarded).metadata();
    expect(metadata.exif).toBeUndefined();
    expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 640, height: 480 });
    const { info } = await sharp(forwarded).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(640);
  });

  it("walks a file packed with tiny segments in time that grows only with its size", () => {
    const filler = segment(0xfe, [0]);
    const packed = jpegWith({ width: 100, height: 100, before: Array.from({ length: 1_000_000 }, () => filler) });

    const started = performance.now();
    const forwarded = acceptPreparedJpeg(packed);

    expect(performance.now() - started).toBeLessThan(1000);
    expect(forwarded.length).toBe(packed.length - 1_000_000 * filler.length);
  });
});
