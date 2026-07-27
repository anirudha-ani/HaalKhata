/** Shrinks a receipt photo in the browser so a phone uploads kilobytes, not megabytes. */

import {
  MAX_UPLOAD_EDGE_PIXELS,
  SKIP_RESIZE_BELOW_BYTES,
  UPLOAD_JPEG_QUALITY,
} from "./image.constants";

/** Pixel dimensions of an image. */
export interface ImageSize {
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
}

/**
 * Whether the browser can decode this file at all.
 *
 * HEIC is what an iPhone shoots by default and no browser engine decodes it,
 * so it has to go up untouched for the server to transcode. This is the same
 * limitation that makes a HEIC preview impossible before parsing.
 *
 * @param file - The chosen file.
 * @returns True when the file is a HEIC/HEIF still.
 */
export function isHeic(file: File): boolean {
  return /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/**
 * Computes the size to redraw an image at so its longest edge fits `maxEdge`,
 * preserving aspect ratio.
 *
 * @param size - The image's natural dimensions.
 * @param maxEdge - Longest edge allowed, in pixels.
 * @returns The target size, or null when the image already fits and should be
 *   left alone. Never enlarges: upscaling invents detail and costs bytes.
 */
export function scaledSize(size: ImageSize, maxEdge: number): ImageSize | null {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxEdge || longest === 0) return null;
  const ratio = maxEdge / longest;
  return {
    // Round, then floor to at least 1: a 4000×3 panorama must not scale to a
    // zero-height canvas, which throws.
    width: Math.max(1, Math.round(size.width * ratio)),
    height: Math.max(1, Math.round(size.height * ratio)),
  };
}

/**
 * Whether a file is worth trying to shrink before upload.
 *
 * @param file - The chosen file.
 * @returns True when it is a browser-decodable image above the size floor.
 */
export function shouldResize(file: File): boolean {
  return !isHeic(file) && file.size > SKIP_RESIZE_BELOW_BYTES;
}

/**
 * Re-encodes a receipt photo down to {@link MAX_UPLOAD_EDGE_PIXELS} for upload.
 *
 * A phone camera produces 3–12 MB per shot, all of which currently crosses a
 * mobile connection so the server can throw most of it away — and anything
 * over 8 MB is rejected outright after the wait. Doing the downscale here
 * turns a typical receipt photo into a few hundred kilobytes.
 *
 * Every failure path returns the original file rather than throwing: a photo
 * that uploads slowly still works, whereas one that never uploads does not.
 * That covers HEIC (undecodable), an unavailable canvas, a re-encode that
 * came out larger, and any browser that lacks `createImageBitmap`.
 *
 * EXIF rotation is baked in via `imageOrientation: "from-image"`, so the
 * bytes are already upright. The server rotates too; it just becomes a no-op.
 *
 * @param file - The photo the user chose or captured.
 * @returns A smaller JPEG File, or the original when shrinking is impossible
 *   or not worthwhile.
 */
export async function prepareReceiptImage(file: File): Promise<File> {
  if (!shouldResize(file)) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const target = scaledSize({ width: bitmap.width, height: bitmap.height }, MAX_UPLOAD_EDGE_PIXELS);
    // Already small enough in pixels; its bytes are just a generous encode,
    // and re-encoding to chase that risks coming out worse.
    if (!target) return file;

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", UPLOAD_JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    // Name it .jpg to match the bytes: the server checks the declared media
    // type against the file's magic bytes and rejects a mismatch.
    const baseName = file.name.replace(/\.[^.]+$/, "") || "receipt";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
