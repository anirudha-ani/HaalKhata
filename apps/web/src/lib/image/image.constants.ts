/**
 * Constants for preparing a receipt photo in the browser to the upload
 * standard (`@haalkhata/shared/receipt/receipt.constants`): its size limits
 * live there, shared with the server that checks them.
 */

/**
 * JPEG quality of the prepared photo. Receipt print stays legible, and a
 * 2576-pixel photo comes out at a few hundred kilobytes, which is what
 * crosses a phone's connection.
 */
export const UPLOAD_JPEG_QUALITY = 0.85;

/**
 * How much of the file head to read when looking for the EXIF orientation
 * tag. It lives in the first APP1 segment, well inside the first 64 KB; a
 * thumbnail can make that segment large, so this is generous rather than
 * tight — it is one slice of an already-in-memory file.
 */
export const EXIF_SCAN_BYTES = 128 * 1024;

/** Bytes of a HEIF file that name it as one: the `ftyp` box at offset 4 and the brand after it. */
export const HEIF_HEADER_BYTES = 12;

/** The `ftyp` box type, at offset 4 of every HEIF file. */
export const HEIF_FILE_TYPE = [0x66, 0x74, 0x79, 0x70];

/** HEIF brands (at offset 8) that still photos carry. */
export const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"];

/**
 * How long converting a HEIC in the browser may take. A 48 MP photo takes a
 * few seconds on a laptop; anything near this is stuck.
 */
export const HEIC_CONVERSION_TIMEOUT_MS = 60_000;

/** Colour a photo with transparency is flattened onto, since a JPEG has none: the receipt's paper. */
export const FLATTEN_BACKGROUND = "#ffffff";

/** Shown beside the photo control when the browser cannot read the photo. */
export const PHOTO_UNREADABLE_MESSAGE =
  "Couldn't read this photo. Try another one, or a screenshot of the receipt.";

/** Shown beside the photo control when even the prepared photo is over the upload limit. */
export const PHOTO_TOO_LARGE_MESSAGE =
  "This photo is too large to upload. Crop it to the receipt and try again.";
