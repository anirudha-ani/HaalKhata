/**
 * Reads a JPEG's EXIF orientation and stored size, so a receipt photo comes
 * out upright on every browser: whether or not the browser turned it while
 * decoding, which current ones do and Safari before 16.4 does not.
 */

import type { ImageSize } from "./imageSize";

/** How an EXIF orientation tag maps onto a canvas transform. */
export interface OrientationTransform {
  /** Whether width and height swap (any 90° turn). */
  swapsAxes: boolean;
  /** Clockwise rotation in degrees, one of 0/90/180/270. */
  rotate: number;
  /** Whether the image is mirrored across the vertical axis after rotating. */
  mirrored: boolean;
}

/** The eight EXIF orientation values, as canvas transforms. Index 0 is unused. */
const TRANSFORMS: readonly OrientationTransform[] = [
  { swapsAxes: false, rotate: 0, mirrored: false }, // 0 — invalid, treated as 1
  { swapsAxes: false, rotate: 0, mirrored: false }, // 1 — as shot
  { swapsAxes: false, rotate: 0, mirrored: true }, // 2
  { swapsAxes: false, rotate: 180, mirrored: false }, // 3
  { swapsAxes: false, rotate: 180, mirrored: true }, // 4
  { swapsAxes: true, rotate: 90, mirrored: true }, // 5
  { swapsAxes: true, rotate: 90, mirrored: false }, // 6 — portrait, the common one
  { swapsAxes: true, rotate: 270, mirrored: true }, // 7
  { swapsAxes: true, rotate: 270, mirrored: false }, // 8
];

/**
 * Maps an EXIF orientation value to the transform that makes it upright.
 *
 * @param orientation - EXIF orientation, 1–8. Anything else is treated as 1.
 * @returns The transform to apply when redrawing.
 */
export function orientationTransform(orientation: number): OrientationTransform {
  return TRANSFORMS[orientation] ?? TRANSFORMS[1];
}

/**
 * Extracts the EXIF orientation tag (0x0112) from JPEG bytes.
 *
 * Read by hand because the browser's own handling cannot be relied on either
 * way: Safari before 16.4 ignores the tag, and Chrome applies it even when
 * `createImageBitmap` is asked not to. The canvas re-encode drops the EXIF
 * block, so a photo the page gets wrong is uploaded sideways with nothing
 * left to say it was; {@link remainingTurn} decides what is still needed.
 *
 * @param bytes - The start of a JPEG file; 64 KB is plenty, the tag lives in
 *   the first APP1 segment.
 * @returns The orientation value 1–8, or 1 when absent or unparseable.
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1; // not a JPEG

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    // Every marker starts with 0xFF; anything else means we've lost sync.
    if (view.getUint8(offset) !== 0xff) return 1;
    const marker = view.getUint8(offset + 1);
    // Start of scan — pixel data begins, so there is no EXIF ahead.
    if (marker === 0xda) return 1;
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2) return 1;

    if (marker === 0xe1 && offset + 10 <= view.byteLength) {
      // APP1: "Exif\0\0" then a TIFF header.
      if (view.getUint32(offset + 4) === 0x45786966) {
        return readTiffOrientation(view, offset + 10);
      }
    }
    offset += 2 + segmentLength;
  }
  return 1;
}

/**
 * Walks the TIFF IFD0 inside an EXIF block looking for the orientation tag.
 *
 * @param view - View over the whole file.
 * @param tiffStart - Byte offset of the TIFF header (just past "Exif\0\0").
 * @returns The orientation value 1–8, or 1 when absent or unparseable.
 */
function readTiffOrientation(view: DataView, tiffStart: number): number {
  if (tiffStart + 8 > view.byteLength) return 1;
  const endianMark = view.getUint16(tiffStart);
  // "II" = little-endian, "MM" = big-endian. Anything else is not TIFF.
  if (endianMark !== 0x4949 && endianMark !== 0x4d4d) return 1;
  const little = endianMark === 0x4949;

  const firstIfd = view.getUint32(tiffStart + 4, little);
  const ifdStart = tiffStart + firstIfd;
  if (ifdStart + 2 > view.byteLength) return 1;

  const entryCount = view.getUint16(ifdStart, little);
  for (let index = 0; index < entryCount; index += 1) {
    const entry = ifdStart + 2 + index * 12;
    if (entry + 12 > view.byteLength) return 1;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/**
 * The size a JPEG stores its pixels at, before any EXIF turn, from its frame
 * header (SOF0–SOF15; 0xC4, 0xC8 and 0xCC share the range but are tables).
 *
 * @param bytes - The start of a JPEG file.
 * @returns The stored size, or null when the frame header is not in the bytes read.
 */
export function readJpegFrameSize(bytes: Uint8Array): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda) return null;
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (offset + 9 > view.byteLength) return null;
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

/**
 * The turn a decoded photo still needs. A quarter turn shows in the decoded
 * size: when the browser hands back the stored width and height unchanged,
 * it ignored the tag and the turn is ours to make; when they come back
 * swapped, it is done. A half turn or a mirror leaves the size alone, so it
 * is taken as done, which every current browser does.
 *
 * @param turn - What the EXIF tag asks for.
 * @param stored - The JPEG's stored size, or null when unknown.
 * @param decoded - The size the browser decoded it at.
 * @returns The transform still to apply.
 */
export function remainingTurn(
  turn: OrientationTransform,
  stored: ImageSize | null,
  decoded: ImageSize,
): OrientationTransform {
  if (!turn.swapsAxes || !stored || stored.width === stored.height) return TRANSFORMS[1];
  const browserIgnoredTag = decoded.width === stored.width && decoded.height === stored.height;
  return browserIgnoredTag ? turn : TRANSFORMS[1];
}
