/** Receipt processor disclosure and explicit consent bound to the current deployment. */

import crypto from "node:crypto";
import { invalid } from "@/server/common/errors";
import { COMPATIBLE_AI } from "../receipt.constants";
import { parseReceipt } from "./receipt.usecase";

/**
 * Describes the actual configured gateway/model before any image is uploaded.
 * The fingerprint changes with routing or retention settings, invalidating stale consent.
 * @returns Processor disclosure and deployment-bound consent version.
 */
export function receiptProcessingInfo() {
  const gatewayHost = COMPATIBLE_AI.baseUrl ? new URL(COMPATIBLE_AI.baseUrl).hostname : "";
  const processors = process.env.RECEIPT_AI_PROCESSORS?.trim() ||
    (gatewayHost === "openrouter.ai" && COMPATIBLE_AI.model.startsWith("google/") ? "OpenRouter and Google (Gemini)" :
      gatewayHost ? `${gatewayHost}, using model ${COMPATIBLE_AI.model || "configured by the operator"}` : "the local demonstration parser");
  const disclosure = `I agree to send this receipt image and its contents to ${processors} to extract receipt items. ` +
    "The image may contain personal or payment information. Remove sensitive details first. " +
    "HaalKhata does not save the image on its server. Review the extracted items before saving; manual entry is available without sharing a photo.";
  const consentVersion = crypto.createHash("sha256").update(JSON.stringify({ disclosure, baseUrl: COMPATIBLE_AI.baseUrl,
    model: COMPATIBLE_AI.model, zeroDataRetention: COMPATIBLE_AI.zeroDataRetention,
    providers: process.env.RECEIPT_AI_PROVIDERS ?? "compatible,mock" })).digest("hex");
  return { disclosure, consentVersion };
}

/**
 * Requires current, explicit processor consent before decoding or sharing image bytes.
 * @param image Receipt image upload.
 * @param consentVersion Version accepted by the client for this image.
 * @returns Structured draft after a consented provider request.
 */
export async function parseReceiptWithConsent(image: Uint8Array, consentVersion: string) {
  if (consentVersion !== receiptProcessingInfo().consentVersion) {
    invalid("review and accept the current receipt-sharing disclosure before using AI");
  }
  return parseReceipt(image);
}
