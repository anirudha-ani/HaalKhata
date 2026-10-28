/**
 * Converts a HEIC/HEIF photo to a prepared receipt JPEG in a Web Worker, for
 * browsers that cannot open HEIC themselves. Each photo gets its own worker,
 * stopped as soon as it answers.
 */

import { MAX_RECEIPT_IMAGE_EDGE_PIXELS } from "@haalkhata/shared/receipt/receipt.constants";
import { HEIC_CONVERSION_TIMEOUT_MS, UPLOAD_JPEG_QUALITY } from "./image.constants";
import type { HeicToJpegAnswer, HeicToJpegRequest } from "./heicToJpeg.worker";

/**
 * Converts a HEIC photo to a JPEG at upload size.
 *
 * @param file - The HEIC file.
 * @returns The JPEG.
 * @throws Error when the worker cannot read the photo, fails, or runs out of time.
 */
export async function heicToJpeg(file: File): Promise<Blob> {
  const bytes = await file.arrayBuffer();
  const worker = new Worker(new URL("./heicToJpeg.worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`HEIC conversion took longer than ${HEIC_CONVERSION_TIMEOUT_MS} ms`)),
        HEIC_CONVERSION_TIMEOUT_MS,
      );
      worker.onmessage = (event: MessageEvent<HeicToJpegAnswer>) => {
        clearTimeout(timer);
        if (event.data.kind === "converted") resolve(event.data.jpeg);
        else reject(new Error(event.data.detail));
      };
      worker.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(event.message || "HEIC worker failed"));
      };
      const request: HeicToJpegRequest = {
        bytes,
        maxEdge: MAX_RECEIPT_IMAGE_EDGE_PIXELS,
        quality: UPLOAD_JPEG_QUALITY,
      };
      worker.postMessage(request, [bytes]);
    });
  } finally {
    worker.terminate();
  }
}
