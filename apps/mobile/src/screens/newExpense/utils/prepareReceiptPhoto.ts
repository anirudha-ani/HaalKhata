/**
 * Native receipt preparation to the upload standard (`@haalkhata/shared/receipt/receipt.constants`):
 * a JPEG, upright, at most 2576 pixels on its longer side, with no metadata, HEIC input included.
 * The server only checks these facts, so the photo has to leave the phone already meeting them.
 */

import { ImageManipulator, SaveFormat, type ImageRef } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import {
  MAX_RECEIPT_IMAGE_BYTES,
  MAX_RECEIPT_IMAGE_EDGE_PIXELS,
  RECEIPT_IMAGE_MEDIA_TYPE,
} from "@haalkhata/shared/receipt/receipt.constants";
import { RECEIPT_JPEG_QUALITY } from "../constants/imagePicker";

/**
 * The resize that brings an image's longer side down to the standard, or null when it already fits.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @returns The resize action's size.
 */
function fitToStandard(width: number, height: number): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= MAX_RECEIPT_IMAGE_EDGE_PIXELS) return null;
  return width >= height ? { width: MAX_RECEIPT_IMAGE_EDGE_PIXELS } : { height: MAX_RECEIPT_IMAGE_EDGE_PIXELS };
}

/**
 * Renders the picked photo, shrunk by the size the picker reported. The render is checked again, because a
 * picker can report a photo's size before its rotation is applied, and a portrait shot then comes out
 * taller than the standard.
 * @param asset The picked photo and what the picker reported about it.
 * @returns The rendered image, within the standard; the caller releases it.
 */
async function renderWithinStandard(asset: ImagePickerAsset): Promise<ImageRef> {
  const context = ImageManipulator.manipulate(asset.uri);
  let rendered: ImageRef;
  try {
    const firstResize = fitToStandard(asset.width, asset.height);
    if (firstResize) context.resize(firstResize);
    rendered = await context.renderAsync();
  } finally { context.release(); }
  const secondResize = fitToStandard(rendered.width, rendered.height);
  if (!secondResize) return rendered;
  const again = ImageManipulator.manipulate(rendered);
  try {
    again.resize(secondResize);
    return await again.renderAsync();
  } finally { again.release(); rendered.release(); }
}

/**
 * Re-encodes locally before upload instead of inferring MIME type from picker compression.
 * @param asset Photo selected by the system picker.
 * @returns Cache URI, JPEG base64 and correct MIME type.
 */
export async function prepareReceiptPhoto(asset: ImagePickerAsset) {
  const rendered = await renderWithinStandard(asset);
  try {
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: RECEIPT_JPEG_QUALITY, base64: true });
    if (!result.base64) throw new Error("Could not read this photo. Try another image.");
    if (Math.ceil(result.base64.length * 3 / 4) > MAX_RECEIPT_IMAGE_BYTES) throw new Error("This photo is too large. Crop the receipt and try again.");
    return { uri: result.uri, base64: result.base64, mediaType: RECEIPT_IMAGE_MEDIA_TYPE };
  } finally { rendered.release(); }
}
