/**
 * Worker thread that turns one HEIC/HEIF photo into the JPEG the providers
 * read, then ends.
 *
 * It runs here rather than on the server's own thread because the decoder,
 * libheif, is WebAssembly: its memory grows to fit the largest photo it has
 * decoded and can never shrink, so on the server's thread one big photo
 * would hold hundreds of megabytes for the life of the process. A worker's
 * memory is returned when it exits.
 *
 * It does not go through sharp to decode. sharp bundles libheif 1.23, whose
 * security limits cap an `iref` box at 16 references, and real iPhone photos
 * carry about 48 (HDR gain map, depth map, thumbnails), so every one of them
 * fails with "Security limit exceeded"; libvips offers no way to relax it.
 *
 * Only packages are imported, no app modules: in tests Node runs this file
 * directly, and the limits arrive in `workerData` instead. It is `.mts` so
 * Node reads it as an ES module without guessing.
 */

import { parentPort, workerData } from "node:worker_threads";
import createLibheif from "libheif-js/libheif-wasm/libheif-bundle.js";
import sharp from "sharp";

/** What the server asks the worker to do. */
export interface HeicTranscodeRequest {
  /** The uploaded HEIC/HEIF bytes. */
  image: Uint8Array;
  /** Most pixels the primary image may have; checked before it is decoded. */
  maxPixels: number;
  /** Longest edge of the JPEG, in pixels. */
  maxEdgePixels: number;
  /** JPEG quality, 1–100. */
  jpegQuality: number;
}

/** What the worker answers. */
export type HeicTranscodeOutcome =
  | { kind: "converted"; jpeg: Uint8Array }
  | { kind: "too-many-pixels" }
  | { kind: "unreadable"; detail: string };

/**
 * Copies pixel rows out of a padded buffer into a tightly packed one, which is
 * the only layout sharp's raw input takes.
 *
 * @param data - Decoded rows, each `stride` bytes long.
 * @param width - Pixels per row.
 * @param height - Rows.
 * @param stride - Bytes from one row's start to the next.
 * @returns Rows of exactly `width × 4` bytes.
 */
function packRows(data: Uint8Array, width: number, height: number, stride: number): Buffer {
  const rowBytes = width * 4;
  const packed = Buffer.alloc(rowBytes * height);
  for (let rowIndex = 0; rowIndex < height; rowIndex++) {
    packed.set(data.subarray(rowIndex * stride, rowIndex * stride + rowBytes), rowIndex * rowBytes);
  }
  return packed;
}

/**
 * Decodes the primary image, checking its size first, and re-encodes it as a
 * JPEG no longer than `maxEdgePixels` on either side.
 *
 * The decoder's own buffer is handed to sharp as it is, without the copy the
 * library's `display()` helper makes: one fewer full-size copy of the photo.
 * Nothing else calls into the decoder while sharp reads it, so the buffer
 * cannot move underneath.
 *
 * @param request - The photo and the limits.
 * @returns The outcome to send back.
 */
async function transcode(request: HeicTranscodeRequest): Promise<HeicTranscodeOutcome> {
  const libheif = createLibheif();
  await libheif.ready;
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(request.image);
  try {
    const primary = images[0];
    if (!primary) return { kind: "unreadable", detail: "HEIF image not found" };
    const width = primary.get_width();
    const height = primary.get_height();
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
        width > Math.floor(request.maxPixels / height)) {
      return { kind: "too-many-pixels" };
    }
    const decoded = libheif.heif_js_decode_image2(
      primary.handle,
      libheif.heif_colorspace.heif_colorspace_RGB,
      libheif.heif_chroma.heif_chroma_interleaved_RGBA,
    );
    if (!decoded || decoded.code) return { kind: "unreadable", detail: "HEIF decode failed" };
    try {
      const channel = decoded.channels.find((plane) => plane.id === libheif.heif_channel.heif_channel_interleaved);
      if (!channel) return { kind: "unreadable", detail: "HEIF decode returned no pixels" };
      const pixels = channel.stride === channel.width * 4
        ? Buffer.from(channel.data.buffer, channel.data.byteOffset, channel.width * 4 * channel.height)
        : packRows(channel.data, channel.width, channel.height, channel.stride);
      const jpeg = await sharp(pixels, { raw: { width: channel.width, height: channel.height, channels: 4 } })
        .resize({
          width: request.maxEdgePixels,
          height: request.maxEdgePixels,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: request.jpegQuality })
        .toBuffer();
      return { kind: "converted", jpeg };
    } finally {
      libheif.heif_image_release(decoded.image);
    }
  } finally {
    for (const image of images) image.free();
    decoder.decoder.delete();
  }
}

transcode(workerData as HeicTranscodeRequest).then(
  (outcome) => parentPort?.postMessage(outcome),
  (error: unknown) =>
    parentPort?.postMessage({
      kind: "unreadable",
      detail: error instanceof Error ? error.message : String(error),
    } satisfies HeicTranscodeOutcome),
);
