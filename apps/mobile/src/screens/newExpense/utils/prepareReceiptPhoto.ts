/** Native receipt normalization: bounded dimensions and actual JPEG bytes, including HEIC input. */

import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import { MAX_RECEIPT_EDGE, MAX_RECEIPT_UPLOAD_BYTES, RECEIPT_JPEG_QUALITY } from "../constants/imagePicker";

/**
 * Re-encodes locally before upload instead of inferring MIME type from picker compression.
 * @param asset Photo selected by the system picker.
 * @returns Cache URI, JPEG base64 and correct MIME type.
 */
export async function prepareReceiptPhoto(asset: ImagePickerAsset) {
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    if (Math.max(asset.width, asset.height) > MAX_RECEIPT_EDGE) {
      context.resize(asset.width >= asset.height ? { width: MAX_RECEIPT_EDGE } : { height: MAX_RECEIPT_EDGE });
    }
    const rendered = await context.renderAsync();
    try {
      const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: RECEIPT_JPEG_QUALITY, base64: true });
      if (!result.base64) throw new Error("Could not read this photo. Try another image.");
      if (Math.ceil(result.base64.length * 3 / 4) > MAX_RECEIPT_UPLOAD_BYTES) throw new Error("This photo is too large. Crop the receipt and try again.");
      return { uri: result.uri, base64: result.base64, mediaType: "image/jpeg" };
    } finally { rendered.release(); }
  } finally { context.release(); }
}
