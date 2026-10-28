/**
 * The receipt photo standard. Both apps turn whatever was picked or shot into
 * exactly this before upload, and the server accepts nothing else: it reads
 * the photo's headers, never its pixels, so no upload can make it decode
 * anything.
 *
 * A prepared photo is a JPEG with rotation already applied to its pixels and
 * no metadata, at most {@link MAX_RECEIPT_IMAGE_EDGE_PIXELS} on its longer
 * side and {@link MAX_RECEIPT_IMAGE_BYTES} in size.
 */

/**
 * Longest side of a prepared photo, in pixels. The ceiling the vision models
 * actually read: anything larger is downsampled on their side, so every pixel
 * above it is upload time spent on bytes that get thrown away.
 */
export const MAX_RECEIPT_IMAGE_EDGE_PIXELS = 2576;

/**
 * Largest prepared photo, in bytes (8 MB). A 2576-pixel JPEG of a receipt is a
 * few hundred kilobytes; even sensor noise at full quality stays well under.
 */
export const MAX_RECEIPT_IMAGE_BYTES = 8 * 1024 * 1024;

/** The one format a prepared photo is in. */
export const RECEIPT_IMAGE_MEDIA_TYPE = "image/jpeg";
