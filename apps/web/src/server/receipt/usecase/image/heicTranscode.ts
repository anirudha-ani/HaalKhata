/**
 * Converts a HEIC/HEIF photo to JPEG in a worker thread that is started for
 * this photo alone and stopped as soon as it answers, so the decoder's memory
 * leaves the process with it. See `heicTranscode.worker.mts` for why.
 */

import { Worker } from "node:worker_threads";
import {
  HEIC_TRANSCODE_TIMEOUT_MS,
  JPEG_QUALITY,
  MAX_HEIC_PIXELS,
  MAX_IMAGE_EDGE_PIXELS,
} from "@/server/receipt/receipt.constants";
import { refuseTooManyPixels } from "./decodeBudget";
import type { HeicTranscodeOutcome, HeicTranscodeRequest } from "./heicTranscode.worker.mjs";

/**
 * Runs one conversion in a fresh worker and stops the worker however it ends:
 * an answer, an error, an exit without an answer, or running out of time.
 *
 * @param request - The photo and limits for the worker.
 * @returns The worker's answer.
 * @throws Error when the worker fails, exits early or takes too long.
 */
function runWorker(request: HeicTranscodeRequest): Promise<HeicTranscodeOutcome> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./heicTranscode.worker.mts", import.meta.url), { workerData: request });
    let finished = false;
    /** Settles once, then stops the worker and its timer. */
    const finish = (settle: () => void) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate();
      settle();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error(`HEIC conversion took longer than ${HEIC_TRANSCODE_TIMEOUT_MS} ms`))),
      HEIC_TRANSCODE_TIMEOUT_MS,
    );
    worker.once("message", (outcome: HeicTranscodeOutcome) => finish(() => resolve(outcome)));
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => finish(() => reject(new Error(`HEIC worker exited with code ${code} before answering`))));
  });
}

/**
 * Converts a HEIC/HEIF photo to the JPEG the providers read.
 *
 * @param image - The uploaded HEIC/HEIF bytes.
 * @returns The JPEG.
 * @throws UsecaseError (invalid_argument) when the photo has more than {@link MAX_HEIC_PIXELS} pixels.
 * @throws Error when it cannot be decoded; the caller words that one.
 */
export async function transcodeHeic(image: Uint8Array): Promise<Buffer> {
  const outcome = await runWorker({
    image,
    maxPixels: MAX_HEIC_PIXELS,
    maxEdgePixels: MAX_IMAGE_EDGE_PIXELS,
    jpegQuality: JPEG_QUALITY,
  });
  if (outcome.kind === "too-many-pixels") refuseTooManyPixels(MAX_HEIC_PIXELS);
  if (outcome.kind === "unreadable") throw new Error(outcome.detail);
  return Buffer.from(outcome.jpeg);
}
