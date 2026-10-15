/** Receipt processor disclosure and saved account permission for the current sharing terms. */

import crypto from "node:crypto";
import { UsecaseError } from "@/server/common/errors";
import { COMPATIBLE_AI } from "../receipt.constants";
import { findReceiptConsent, removeReceiptConsent, saveReceiptConsent } from "../repo/receiptConsent.repo";
import { parseReceipt } from "./receipt.usecase";

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
  const disclosure = `Receipt photos you choose to scan and their contents will be sent to ${processors} to extract items, tax and tip. ` +
    "Photos may contain personal or payment information; remove sensitive details first. " +
    "HaalKhata does not save receipt images on its server. Review the extracted items before saving.";
  const consentVersion = crypto.createHash("sha256").update(JSON.stringify({ disclosure, gatewayHost, modelProvider,
    zeroDataRetention: COMPATIBLE_AI.zeroDataRetention,
    providers: process.env.RECEIPT_AI_PROVIDERS ?? "compatible,mock" })).digest("hex");
  return { disclosure, consentVersion };
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
 * Checks saved permission on every scan, including requests from stale clients.
 * Revocation prevents subsequent processing; it cannot recall an in-flight provider request.
 * @param userId Signed-in account.
 * @param image Receipt image upload.
 * @param consentVersion Current sharing terms known to the client.
 * @returns Structured draft after an authorized provider request.
 */
export async function parseReceiptWithConsent(userId: string, image: Uint8Array, consentVersion: string) {
  const information = await getReceiptProcessingInfo(userId);
  if (!information.consentGranted || consentVersion !== information.consentVersion) {
    throw new UsecaseError("failed_precondition", "Allow AI receipt scanning before sharing this photo. Review the current receipt-sharing details.");
  }
  return parseReceipt(image);
}
