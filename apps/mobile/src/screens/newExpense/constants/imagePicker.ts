/** New-expense-route constants: receipt image picker configuration. */

import type { ImagePickerOptions } from "expo-image-picker";

/**
 * Select the original photo; prepareReceiptPhoto performs bounded JPEG encoding
 * locally before the ParseReceipt RPC receives any bytes.
 */
export const PICKER_OPTIONS: ImagePickerOptions = {
  base64: false,
  mediaTypes: ["images"],
  quality: 1,
};

/** Explicit native JPEG compression; picker quality does not guarantee a MIME type. */
export const RECEIPT_JPEG_QUALITY = 0.8;
