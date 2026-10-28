/**
 * Prepares a receipt photo in the browser to the upload standard
 * (`@haalkhata/shared/receipt/receipt.constants`): a JPEG at most 2576 pixels
 * on its longer side, already upright, with no metadata. The server checks
 * those facts and accepts nothing else, so it never has to decode a photo.
 */

import {
  MAX_RECEIPT_IMAGE_BYTES,
  MAX_RECEIPT_IMAGE_EDGE_PIXELS,
  RECEIPT_IMAGE_MEDIA_TYPE,
} from "@haalkhata/shared/receipt/receipt.constants";
import {
  orientationTransform,
  readJpegFrameSize,
  readJpegOrientation,
  remainingTurn,
  type OrientationTransform,
} from "./exifOrientation";
import { heicToJpeg } from "./heicToJpeg";
import {
  EXIF_SCAN_BYTES,
  FLATTEN_BACKGROUND,
  HEIF_BRANDS,
  HEIF_FILE_TYPE,
  HEIF_HEADER_BYTES,
  PHOTO_TOO_LARGE_MESSAGE,
  PHOTO_UNREADABLE_MESSAGE,
  UPLOAD_JPEG_QUALITY,
} from "./image.constants";
import { uploadSize } from "./imageSize";

/**
 * Whether a file is a HEIC/HEIF still, the format an iPhone shoots by default.
 * Browsers often give it no type, so its name and first bytes count too.
 *
 * @param file - The chosen file.
 * @param header - The file's first bytes.
 * @returns True for a HEIC/HEIF photo.
 */
export function isHeic(file: File, header: Uint8Array): boolean {
  if (/^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return true;
  if (header.length < HEIF_HEADER_BYTES) return false;
  const hasFileType = HEIF_FILE_TYPE.every((byte, index) => header[4 + index] === byte);
  const brand = String.fromCharCode(...header.subarray(8, HEIF_HEADER_BYTES));
  return hasFileType && HEIF_BRANDS.includes(brand);
}

/**
 * Draws a decoded photo upright at upload size on a white page and encodes it
 * as a JPEG. The canvas writes no metadata, so EXIF (and where the photo was
 * taken) stays on the device.
 *
 * @param bitmap - The decoded photo.
 * @param turn - Rotation the pixels still need.
 * @returns The JPEG.
 * @throws Error when the browser has no canvas to draw on.
 */
async function drawAsJpeg(bitmap: ImageBitmap, turn: OrientationTransform): Promise<Blob> {
  const target = uploadSize({ width: bitmap.width, height: bitmap.height }, MAX_RECEIPT_IMAGE_EDGE_PIXELS);
  const canvas = document.createElement("canvas");
  // A quarter turn swaps the axes, so the canvas takes the drawn size
  // transposed or the image is cropped to its own corner.
  canvas.width = turn.swapsAxes ? target.height : target.width;
  canvas.height = turn.swapsAxes ? target.width : target.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2D canvas");
  context.fillStyle = FLATTEN_BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  if (turn.rotate !== 0) context.rotate((turn.rotate * Math.PI) / 180);
  if (turn.mirrored) context.scale(-1, 1);
  context.drawImage(bitmap, -target.width / 2, -target.height / 2, target.width, target.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, RECEIPT_IMAGE_MEDIA_TYPE, UPLOAD_JPEG_QUALITY),
  );
  if (!blob) throw new Error("the canvas produced no JPEG");
  return blob;
}

/**
 * Decodes the photo with the browser's own decoder and prepares it.
 *
 * The browser is asked to turn the photo upright as it decodes. Current
 * browsers do; Safari before 16.4 ignores the request for a JPEG, which shows
 * in the decoded size, and then the turn read from the EXIF tag is made here
 * ({@link remainingTurn}). A HEIC keeps its rotation in the image itself,
 * which Safari (the one browser that opens HEIC) applies as it decodes.
 *
 * @param file - The chosen file.
 * @param header - The file's first bytes.
 * @param heic - Whether it is a HEIC.
 * @returns The prepared JPEG.
 * @throws Error when the browser cannot decode it.
 */
async function prepareInBrowser(file: File, header: Uint8Array, heic: boolean): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const turn = heic
      ? orientationTransform(1)
      : remainingTurn(orientationTransform(readJpegOrientation(header)), readJpegFrameSize(header), bitmap);
    return await drawAsJpeg(bitmap, turn);
  } finally {
    bitmap.close();
  }
}

/**
 * Turns any photo the person picked or shot into a prepared receipt photo.
 *
 * Every photo is re-encoded, even one already small, because that is what
 * applies its rotation and leaves its metadata behind. A HEIC the browser
 * cannot open (Chrome, Firefox, Edge) is converted by libheif in a Web Worker.
 *
 * @param file - The photo the user chose or captured.
 * @returns The JPEG to upload.
 * @throws Error with words for the person when the photo cannot be read or is
 *   still over the upload limit once prepared.
 */
export async function prepareReceiptImage(file: File): Promise<File> {
  const header = new Uint8Array(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
  const heic = isHeic(file, header);
  let jpeg: Blob;
  try {
    jpeg = await prepareInBrowser(file, header, heic);
  } catch (browserError) {
    if (!heic) {
      console.warn("receipt photo could not be decoded by the browser", browserError);
      throw new Error(PHOTO_UNREADABLE_MESSAGE);
    }
    try {
      jpeg = await heicToJpeg(file);
    } catch (workerError) {
      console.warn("receipt HEIC could not be converted", workerError);
      throw new Error(PHOTO_UNREADABLE_MESSAGE);
    }
  }
  if (jpeg.size > MAX_RECEIPT_IMAGE_BYTES) throw new Error(PHOTO_TOO_LARGE_MESSAGE);
  const baseName = file.name.replace(/\.[^.]+$/, "") || "receipt";
  return new File([jpeg], `${baseName}.jpg`, { type: RECEIPT_IMAGE_MEDIA_TYPE });
}
