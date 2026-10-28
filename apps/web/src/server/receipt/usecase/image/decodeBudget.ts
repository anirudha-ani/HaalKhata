/**
 * Measures what an image will unpack to from its header alone, and refuses
 * one too large before any of it is decoded.
 */

import sharp from "sharp";
import { invalid } from "@/server/common/errors";
import {
  BYTES_PER_SAMPLE,
  MAX_DECODED_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  UNKNOWN_BYTES_PER_SAMPLE,
} from "@/server/receipt/receipt.constants";

/**
 * Whether a width and height stay within a pixel ceiling, compared without
 * multiplying values the file chose.
 *
 * @param width - Image width from its header.
 * @param height - Image height from its header.
 * @param maxPixels - The ceiling.
 * @returns True when the image has at most `maxPixels` pixels.
 */
export function fitsPixelCeiling(width: number, height: number, maxPixels: number): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= Math.floor(maxPixels / height)
  );
}

/**
 * Refuses a photo over a pixel ceiling, in words the person can act on.
 *
 * @param maxPixels - The ceiling it went over.
 * @throws UsecaseError (invalid_argument), always.
 */
export function refuseTooManyPixels(maxPixels: number): never {
  invalid(
    `that photo is too large to read (over ${maxPixels / 1_000_000} megapixels). Crop it to the receipt or save it as a JPEG`,
  );
}

/**
 * Reads a JPEG, PNG, WebP or GIF header and refuses the image when its pixels,
 * or the memory they unpack to, are over the limit. Nothing is decoded.
 *
 * @param image - The uploaded bytes.
 * @throws UsecaseError (invalid_argument) when the image is too large to unpack.
 * @throws Error when the header cannot be read; the caller words that one.
 */
export async function assertDecodeFits(image: Buffer): Promise<void> {
  const { width, height, channels, depth } = await sharp(image).metadata();
  if (width === undefined || height === undefined || channels === undefined) {
    throw new Error("image header gives no dimensions");
  }
  if (!fitsPixelCeiling(width, height, MAX_IMAGE_PIXELS)) refuseTooManyPixels(MAX_IMAGE_PIXELS);
  const bytesPerSample = (depth && BYTES_PER_SAMPLE[depth]) || UNKNOWN_BYTES_PER_SAMPLE;
  if (width * height * channels * bytesPerSample > MAX_DECODED_IMAGE_BYTES) {
    invalid("that image holds far more detail than a receipt needs. Save it as a JPEG and try again");
  }
}
