/** New-expense-route constants: receipt image picker configuration. */

import type { ImagePickerOptions } from "expo-image-picker";

/**
 * Options for both the camera and the photo library: JPEG-quality compression
 * keeps receipts well under the server's 8 MB limit, and base64 is requested
 * because the ParseReceipt RPC takes raw bytes.
 */
export const PICKER_OPTIONS: ImagePickerOptions = {
  base64: true,
  mediaTypes: ["images"],
  quality: 0.7,
};
