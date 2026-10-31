/**
 * Web Worker that converts one HEIC/HEIF photo into a prepared receipt JPEG,
 * for browsers that cannot open HEIC themselves (Chrome, Firefox, Edge).
 *
 * It decodes with libheif compiled to WebAssembly, loaded only when somebody
 * picks a HEIC, and draws the result at upload size on an OffscreenCanvas, so
 * the page stays responsive while a 48 MP photo is read. libheif applies the
 * photo's rotation as it decodes. The page stops this worker after one photo,
 * which frees the decoder's memory.
 */

import createLibheif from "libheif-js/libheif-wasm/libheif-bundle.mjs";
import { uploadSize } from "./imageSize";

/** What the page sends: the photo and how to prepare it. */
export interface HeicToJpegRequest {
  /** The HEIC file's bytes. */
  bytes: ArrayBuffer;
  /** Longest edge of the result, in pixels. */
  maxEdge: number;
  /** JPEG quality, 0–1. */
  quality: number;
}

/** What the worker answers. */
export type HeicToJpegAnswer =
  | { kind: "converted"; jpeg: Blob }
  | { kind: "failed"; detail: string };

/**
 * Copies pixel rows out of a padded buffer into a tightly packed one, which is
 * what ImageData takes.
 *
 * @param data - Decoded rows, each `stride` bytes long.
 * @param width - Pixels per row.
 * @param height - Rows.
 * @param stride - Bytes from one row's start to the next.
 * @returns Rows of exactly `width × 4` bytes.
 */
function packRows(data: Uint8Array, width: number, height: number, stride: number): Uint8ClampedArray<ArrayBuffer> {
  const rowBytes = width * 4;
  const packed = new Uint8ClampedArray(rowBytes * height);
  for (let rowIndex = 0; rowIndex < height; rowIndex++) {
    packed.set(data.subarray(rowIndex * stride, rowIndex * stride + rowBytes), rowIndex * rowBytes);
  }
  return packed;
}

/**
 * Decodes the photo's primary image and draws it as a JPEG no longer than
 * `maxEdge` on either side.
 *
 * The decoder's own pixel buffer becomes the ImageData without a copy;
 * nothing calls into the decoder again until the bitmap is made, so the
 * buffer cannot move underneath.
 *
 * @param request - The photo and how to prepare it.
 * @returns The JPEG.
 */
async function convert(request: HeicToJpegRequest): Promise<Blob> {
  const libheif = createLibheif();
  await libheif.ready;
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(request.bytes));
  try {
    const primary = images[0];
    if (!primary) throw new Error("HEIF image not found");
    const decoded = libheif.heif_js_decode_image2(
      primary.handle,
      libheif.heif_colorspace.heif_colorspace_RGB,
      libheif.heif_chroma.heif_chroma_interleaved_RGBA,
    );
    if (!decoded || decoded.code) throw new Error("HEIF decode failed");
    try {
      const plane = decoded.channels.find((channel) => channel.id === libheif.heif_channel.heif_channel_interleaved);
      if (!plane) throw new Error("HEIF decode returned no pixels");
      const pixels = plane.stride === plane.width * 4
        ? new Uint8ClampedArray(plane.data.buffer as ArrayBuffer, plane.data.byteOffset, plane.width * 4 * plane.height)
        : packRows(plane.data, plane.width, plane.height, plane.stride);
      const target = uploadSize({ width: plane.width, height: plane.height }, request.maxEdge);
      const bitmap = await createImageBitmap(new ImageData(pixels, plane.width, plane.height), {
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: "high",
      });
      try {
        const canvas = new OffscreenCanvas(target.width, target.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no 2D canvas in this worker");
        context.drawImage(bitmap, 0, 0, target.width, target.height);
        return await canvas.convertToBlob({ type: "image/jpeg", quality: request.quality });
      } finally {
        bitmap.close();
      }
    } finally {
      libheif.heif_image_release(decoded.image);
    }
  } finally {
    for (const image of images) image.free();
    decoder.decoder.delete();
  }
}

self.onmessage = (event: MessageEvent<HeicToJpegRequest>) => {
  convert(event.data).then(
    (jpeg) => self.postMessage({ kind: "converted", jpeg } satisfies HeicToJpegAnswer),
    (error: unknown) =>
      self.postMessage({
        kind: "failed",
        detail: error instanceof Error ? error.message : String(error),
      } satisfies HeicToJpegAnswer),
  );
};
