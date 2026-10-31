/**
 * Builds JPEG byte streams segment by segment for tests of the upload check,
 * which reads only segment headers: a frame of any claimed size, metadata to
 * strip, and a few scan bytes, without encoding any pixels.
 */

/** Options for {@link jpegWith}. */
export interface JpegOptions {
  /** Width the frame header claims. */
  width: number;
  /** Height the frame header claims. */
  height: number;
  /** A progressive frame (SOF2) instead of a baseline one (SOF0). */
  progressive?: boolean;
  /** Segments to place before the frame, such as {@link exifSegment}. */
  before?: Uint8Array[];
}

/**
 * One segment: marker, length, payload.
 *
 * @param marker - The byte after 0xFF.
 * @param payload - The segment's contents.
 * @returns The encoded segment.
 */
export function segment(marker: number, payload: Uint8Array | number[]): Uint8Array {
  const body = Uint8Array.from(payload);
  return Uint8Array.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body]);
}

/** A JFIF header (APP0), which is kept. */
export const JFIF_SEGMENT = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);

/** A colour profile header (APP2), which is kept. */
export const ICC_SEGMENT = segment(0xe2, [...new TextEncoder().encode("ICC_PROFILE"), 0, 1, 1, 0x12, 0x34]);

/** An EXIF block (APP1) carrying a recognisable GPS marker, which is removed. */
export const EXIF_SEGMENT = segment(0xe1, [...new TextEncoder().encode("Exif"), 0, 0, ...new TextEncoder().encode("GPS-SECRET")]);

/** A comment (COM), which is removed. */
export const COMMENT_SEGMENT = segment(0xfe, new TextEncoder().encode("taken at home"));

/** Bytes standing in for compressed scan data; never decoded. */
export const SCAN_BYTES = Uint8Array.from([0x12, 0x34, 0x56, 0x78, 0x9a]);

/**
 * Concatenates byte arrays.
 *
 * @param parts - The arrays, in order.
 * @returns One array holding them all.
 */
export function concat(parts: Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of parts) {
    joined.set(part, position);
    position += part.length;
  }
  return joined;
}

/**
 * A JPEG whose frame claims the given size: start of image, any extra
 * segments, a quantisation table, the frame, a Huffman table, one scan and the
 * end of image.
 *
 * @param options - Size, kind and extra segments.
 * @returns The JPEG bytes.
 */
export function jpegWith(options: JpegOptions): Uint8Array {
  const { width, height } = options;
  const frame = segment(options.progressive ? 0xc2 : 0xc0, [
    8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]);
  return concat([
    Uint8Array.from([0xff, 0xd8]),
    ...(options.before ?? [JFIF_SEGMENT]),
    segment(0xdb, [0, ...new Array<number>(64).fill(1)]),
    frame,
    segment(0xc4, [0, ...new Array<number>(16).fill(0)]),
    segment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]),
    SCAN_BYTES,
    Uint8Array.from([0xff, 0xd9]),
  ]);
}

/**
 * Whether one byte sequence appears inside another.
 *
 * @param haystack - Bytes to search.
 * @param needle - Bytes to find.
 * @returns True when found.
 */
export function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let start = 0; start + needle.length <= haystack.length; start++) {
    for (let index = 0; index < needle.length; index++) {
      if (haystack[start + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}
