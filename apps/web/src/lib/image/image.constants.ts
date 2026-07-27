/** Constants for preparing a receipt photo in the browser before upload. */

/**
 * Longest edge, in pixels, worth uploading. Deliberately the same number as
 * the server's `MAX_IMAGE_EDGE_PIXELS`: the server downsamples to this before
 * showing any provider the image, so every pixel above it is upload time
 * spent on bytes that get thrown away — and on a phone that upload is the
 * slowest part of the whole flow.
 */
export const MAX_UPLOAD_EDGE_PIXELS = 2576;

/**
 * JPEG quality for the re-encode. Slightly below the server's 88 because this
 * pass is about getting off the phone's radio quickly; the receipt print is
 * still legible, and the server re-encodes from what it receives anyway.
 */
export const UPLOAD_JPEG_QUALITY = 0.85;

/**
 * Files at or below this size are uploaded untouched. Re-encoding a small
 * photo costs a decode, a canvas draw and an encode to save nothing — and can
 * make it bigger.
 */
export const SKIP_RESIZE_BELOW_BYTES = 512 * 1024;

/**
 * How much of the file head to read when looking for the EXIF orientation
 * tag. It lives in the first APP1 segment, well inside the first 64 KB; a
 * thumbnail can make that segment large, so this is generous rather than
 * tight — it is one slice of an already-in-memory file.
 */
export const EXIF_SCAN_BYTES = 128 * 1024;
