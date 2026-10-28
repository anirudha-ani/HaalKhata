/**
 * Turns any accepted upload into the JPEG the vision providers read, without
 * letting the image unpack to more memory than the process can spare.
 */

import sharp from "sharp";
import { invalid, UsecaseError } from "@/server/common/errors";
import { logEvent } from "@/server/common/logger";
import {
  IMAGE_DECODE_SLOTS,
  JPEG_QUALITY,
  MAX_IMAGE_EDGE_PIXELS,
  MAX_IMAGE_PIXELS,
  type ImageMediaType,
} from "@/server/receipt/receipt.constants";
import { assertDecodeFits } from "./decodeBudget";
import { withDecodeSlots } from "./decodeSlots";
import { transcodeHeic } from "./heicTranscode";

/**
 * Whether libvips's operation cache has been turned off. Each image is read
 * once, so the cache never saves work; it only keeps unpacked pixels alive
 * after the scan that needed them.
 */
let cacheDisabled = false;

/**
 * Re-encodes a JPEG, PNG, WebP or GIF: EXIF rotation applied, long edge capped.
 *
 * @param image - The uploaded bytes, already measured by {@link assertDecodeFits}.
 * @returns The JPEG.
 */
function transcodeWithSharp(image: Buffer): Promise<Buffer> {
  if (!cacheDisabled) {
    sharp.cache(false);
    cacheDisabled = true;
  }
  return sharp(image, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate() // no argument = apply the EXIF orientation tag
    .resize({
      width: MAX_IMAGE_EDGE_PIXELS,
      height: MAX_IMAGE_EDGE_PIXELS,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Transcodes any accepted upload into the JPEG the vision providers take.
 *
 * Three things happen here, all of which matter for receipts:
 *  - **HEIC becomes JPEG.** iPhones shoot HEIC by default and no vision API
 *    accepts it, so without this every default iPhone photo fails.
 *  - **EXIF rotation is applied.** Phone cameras record orientation as metadata
 *    rather than rotating pixels; providers read pixels, so a sideways receipt
 *    would otherwise be transcribed sideways. (HEIC arrives already oriented
 *    from the decoder.)
 *  - **The long edge is capped.** Anything beyond what the model uses is
 *    downsampled on their side anyway, so sending it only costs upload time.
 *
 * Before any of it, the image is measured from its header and refused if it
 * would unpack to more than the budget, and the decode waits for its share of
 * the process's decode slots: one for most formats, all of them for HEIC.
 *
 * @param image - Raw uploaded bytes, already validated.
 * @param format - Format detected from the bytes.
 * @returns The JPEG bytes, which are both sent to the provider (base64) and
 *   handed back to the client so it can show what the model actually read.
 * @throws UsecaseError (invalid_argument) when the image is too large or cannot be decoded.
 */
export async function normalizeToJpeg(image: Uint8Array, format: ImageMediaType): Promise<Buffer> {
  try {
    if (format === "image/heic" || format === "image/heif") {
      return await withDecodeSlots(IMAGE_DECODE_SLOTS, () => transcodeHeic(image));
    }
    const bytes = Buffer.from(image);
    await assertDecodeFits(bytes);
    return await withDecodeSlots(1, () => transcodeWithSharp(bytes));
  } catch (error) {
    // Our own limits are already worded for the user; only a decoder's
    // failure is rewritten. The decoder's words name a native library and
    // its internals, so they go to the log and the user gets what to do.
    if (error instanceof UsecaseError) throw error;
    logEvent("warn", "receipt image could not be decoded", {
      detail: error instanceof Error ? error.message : String(error),
    });
    invalid("could not read that image. Try a clear JPEG, PNG or WebP photo");
  }
}
