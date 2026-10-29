/** Receipt processor disclosure and saved account permission for the current sharing terms. */

import crypto from "node:crypto";
import { UsecaseError } from "@/server/common/errors";
import { rateLimitCheck, rateLimitWouldAllow } from "@/server/common/rateLimit/rateLimit";
import {
  COMPATIBLE_AI,
  RECEIPT_SCAN_RATE_KEY,
  RECEIPT_SCAN_RATE_MESSAGE,
  RECEIPT_SCANS_PER_MINUTE,
} from "../receipt.constants";
import { findReceiptConsent, removeReceiptConsent, saveReceiptConsent } from "../repo/receiptConsent.repo";
import { scanReceipt } from "./receipt.usecase";
import { receiptScanLanes } from "./scanLanes/scanLanes";

/**
 * Describes recipients and use before image sharing. Routine model upgrades do
 * not reset permission; recipients, provider routing and retention changes do.
 * @returns Public disclosure and its sharing-terms fingerprint.
 */
export function receiptProcessingInfo() {
  const gatewayHost = COMPATIBLE_AI.baseUrl ? new URL(COMPATIBLE_AI.baseUrl).hostname : "";
  const modelProvider = gatewayHost === "openrouter.ai" ? COMPATIBLE_AI.model.split("/")[0] : "";
  const processors = process.env.RECEIPT_AI_PROCESSORS?.trim() ||
    (gatewayHost === "openrouter.ai" && modelProvider === "google" ? "OpenRouter and Google (Gemini)" :
      gatewayHost === "openrouter.ai" ? `OpenRouter and ${modelProvider || "its configured AI provider"}` :
        gatewayHost || "the local demonstration parser");
  // Preserve the established sharing-terms fingerprint when only presentation copy changes.
  const consentTerms = `Receipt photos you choose to scan and their contents will be sent to ${processors} to extract items, tax and tip. ` +
    "Photos may contain personal or payment information; remove sensitive details first. " +
    "HaalKhata does not save receipt images on its server. Review the extracted items before saving.";
  const consentVersion = crypto.createHash("sha256").update(JSON.stringify({ disclosure: consentTerms, gatewayHost, modelProvider,
    zeroDataRetention: COMPATIBLE_AI.zeroDataRetention,
    providers: process.env.RECEIPT_AI_PROVIDERS ?? "compatible,mock" })).digest("hex");
  return { disclosure: `Receipt photos are shared with ${processors} for AI scanning.`, consentVersion };
}

/** @param userId Signed-in account. @returns Current disclosure and its saved permission status. */
export async function getReceiptProcessingInfo(userId: string) {
  const information = receiptProcessingInfo();
  return { ...information, consentGranted: await findReceiptConsent(userId) === information.consentVersion };
}

/**
 * Saves explicit permission for future scans on this account, never for another account.
 * @param userId Signed-in account.
 * @param version The disclosure displayed by the client.
 * @returns Updated permission status.
 */
export async function grantReceiptConsent(userId: string, version: string) {
  const information = receiptProcessingInfo();
  if (version !== information.consentVersion) {
    throw new UsecaseError("failed_precondition", "Receipt-sharing details changed. Review them before allowing AI scanning.");
  }
  await saveReceiptConsent(userId, version);
  return { ...information, consentGranted: true };
}

/** @param userId Account withdrawing permission. @returns Current disclosure with permission disabled. */
export async function revokeReceiptConsent(userId: string) {
  await removeReceiptConsent(userId);
  return { ...receiptProcessingInfo(), consentGranted: false };
}

/**
 * Scans a receipt for a person, in this order, so nothing refused costs
 * them anything:
 *
 * 1. Saved permission, on every scan, including requests from stale
 *    clients. Revocation prevents subsequent processing; it cannot recall an
 *    in-flight provider request.
 * 2. Their per-minute allowance, checked but not spent, so somebody out of
 *    scans is told so at once instead of after waiting for a lane.
 * 3. A lane (receiptScanLanes): their earlier scan, if any, stops; with
 *    every lane taken they wait in a short line, and are told scanning is
 *    busy if it is full or the wait runs out.
 * 4. Only now is one of their scans for the minute spent, and the photo
 *    goes to the provider. Only a scan that got this far is counted as an
 *    attempt.
 *
 * Everything after the lane listens to its signal: when the request goes
 * away or the person starts another scan, the scan stops and the lane goes
 * to whoever is next.
 *
 * @param userId Signed-in account.
 * @param image Receipt image upload.
 * @param consentVersion Current sharing terms known to the client.
 * @param currency Expense currency for ambiguous receipts.
 * @param requestSignal Aborts when the request goes away.
 * @returns Structured draft after an authorized provider request.
 */
export async function parseReceiptWithConsent(
  userId: string,
  image: Uint8Array,
  consentVersion: string,
  currency: string,
  requestSignal: AbortSignal,
) {
  const information = await getReceiptProcessingInfo(userId);
  if (!information.consentGranted || consentVersion !== information.consentVersion) {
    throw new UsecaseError("failed_precondition", "Allow AI receipt scanning before sharing this photo. Review the current receipt-sharing details.");
  }
  const rateKey = `${RECEIPT_SCAN_RATE_KEY}${userId}`;
  if (!rateLimitWouldAllow(rateKey, RECEIPT_SCANS_PER_MINUTE)) throw new UsecaseError("resource_exhausted", RECEIPT_SCAN_RATE_MESSAGE);
  const lane = await receiptScanLanes.enter(userId, requestSignal);
  try {
    if (!rateLimitCheck(rateKey, RECEIPT_SCANS_PER_MINUTE)) throw new UsecaseError("resource_exhausted", RECEIPT_SCAN_RATE_MESSAGE);
    return await scanReceipt(userId, image, currency || "USD", lane.signal);
  } finally {
    lane.release();
  }
}
