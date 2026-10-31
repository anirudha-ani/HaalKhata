/**
 * Accepts an upload only when it is a prepared receipt photo (the standard in
 * `@haalkhata/shared/receipt/receipt.constants`), and removes any metadata
 * before it is forwarded.
 *
 * Both apps convert, rotate and shrink the photo on the device, so the server
 * never decodes an image: it walks the JPEG's segment headers up to the first
 * scan, which costs the same whatever the photo shows, and forwards the
 * compressed bytes as they came.
 */

import { MAX_RECEIPT_IMAGE_EDGE_PIXELS } from "@haalkhata/shared/receipt/receipt.constants";
import { invalid } from "@/server/common/errors";
import {
  JPEG_FRAME_MARKERS,
  JPEG_MARKER,
  JPEG_METADATA_MARKERS,
  JPEG_STANDALONE_MARKERS,
  NOT_PREPARED_MESSAGE,
} from "@/server/receipt/receipt.constants";

/**
 * Refuses an upload that is not a prepared photo.
 *
 * @throws UsecaseError (invalid_argument), always.
 */
function refuse(): never {
  invalid(NOT_PREPARED_MESSAGE);
}

/**
 * Checks that the bytes are one whole JPEG, no larger than the standard on
 * either side, and returns it without its metadata segments (EXIF, XMP and
 * the like, which can say where the photo was taken). Everything from the
 * first scan on is kept byte for byte.
 *
 * @param image - The uploaded bytes, already within the byte limit.
 * @returns The photo to forward.
 * @throws UsecaseError (invalid_argument) when it is not a prepared photo.
 */
export function acceptPreparedJpeg(image: Uint8Array): Uint8Array {
  const length = image.length;
  if (length < 4 || image[0] !== 0xff || image[1] !== JPEG_MARKER.startOfImage) refuse();
  if (image[length - 2] !== 0xff || image[length - 1] !== JPEG_MARKER.endOfImage) refuse();

  const kept: Uint8Array[] = [image.subarray(0, 2)];
  let frame: { width: number; height: number } | null = null;
  let offset = 2;
  for (;;) {
    if (offset + 1 >= length || image[offset] !== 0xff) refuse();
    let marker = image[offset + 1];
    while (marker === JPEG_MARKER.fill) {
      offset++;
      if (offset + 1 >= length) refuse();
      marker = image[offset + 1];
    }
    if (JPEG_STANDALONE_MARKERS.has(marker)) {
      kept.push(image.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (marker === JPEG_MARKER.startOfImage || marker === JPEG_MARKER.endOfImage) refuse();
    if (offset + 4 > length) refuse();
    const segmentEnd = offset + 2 + ((image[offset + 2] << 8) | image[offset + 3]);
    if (segmentEnd - offset < 4 || segmentEnd > length) refuse();

    if (marker === JPEG_MARKER.startOfScan) {
      if (!frame) refuse();
      kept.push(image.subarray(offset));
      break;
    }
    if (JPEG_FRAME_MARKERS.has(marker)) {
      // A frame header: precision (1 byte), then height and width (2 each).
      if (frame || segmentEnd - offset < 9) refuse();
      frame = {
        height: (image[offset + 5] << 8) | image[offset + 6],
        width: (image[offset + 7] << 8) | image[offset + 8],
      };
    }
    if (!JPEG_METADATA_MARKERS.has(marker)) kept.push(image.subarray(offset, segmentEnd));
    offset = segmentEnd;
  }

  // A height of 0 means "given later in the scan", which no prepared photo does.
  if (!frame) refuse();
  const { width, height } = frame;
  if (width === 0 || height === 0) refuse();
  if (width > MAX_RECEIPT_IMAGE_EDGE_PIXELS || height > MAX_RECEIPT_IMAGE_EDGE_PIXELS) refuse();

  const total = kept.reduce((bytes, part) => bytes + part.length, 0);
  if (total === length) return image;
  const stripped = new Uint8Array(total);
  let position = 0;
  for (const part of kept) {
    stripped.set(part, position);
    position += part.length;
  }
  return stripped;
}
