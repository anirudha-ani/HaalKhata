/** Reads the EXIF orientation tag out of a JPEG, so rotation never depends on browser support. */

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
 * Done by hand rather than trusting `createImageBitmap`'s
 * `imageOrientation: "from-image"`, which Safari only supports from 16.4. On
 * an older iPhone that option is silently ignored, and because the canvas
 * re-encode drops the EXIF block, the server loses its chance to rotate too —
 * so the receipt would upload sideways with nothing left to say it was.
 * Reading the tag ourselves makes the result identical on every browser.
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
