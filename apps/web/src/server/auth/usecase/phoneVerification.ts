/** SMS possession verification through Twilio Verify v2. */

import { UsecaseError, invalid } from "@/server/common/errors";
import { logEvent } from "@/server/common/logger";
import {
  PHONE_VERIFICATION_CODE_PATTERN,
  PHONE_VERIFICATION_TIMEOUT_MS,
  TWILIO_VERIFY_BASE_URL,
} from "@/server/auth/auth.constants";

/** Minimal Twilio Verify response used by both start and check operations. */
interface VerificationResponse {
  status?: string;
  code?: number;
}

/** Required provider configuration, read at call time for testability. */
interface VerificationConfiguration {
  apiKeySid: string;
  apiKeySecret: string;
  serviceSid: string;
}

/**
 * Loads the Twilio Verify credentials or fails closed when any are missing.
 *
 * @returns Complete provider configuration.
 * @throws UsecaseError "unavailable" when phone verification is not configured.
 */
function configuration(): VerificationConfiguration {
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim() ?? "";
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim() ?? "";
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim() ?? "";
  if (!apiKeySid || !apiKeySecret || !serviceSid) {
    throw new UsecaseError("unavailable", "phone verification is temporarily unavailable");
  }
  return { apiKeySid, apiKeySecret, serviceSid };
}

/**
 * Calls one Twilio Verify endpoint with fixed-origin, form-encoded input.
 *
 * @param operation - Provider endpoint and form fields.
 * @returns Provider HTTP status and parsed response body.
 */
async function providerRequest(operation: {
  endpoint: "Verifications" | "VerificationCheck";
  fields: Record<string, string>;
}): Promise<{ ok: boolean; status: number; body: VerificationResponse }> {
  const provider = configuration();
  const response = await fetch(
    `${TWILIO_VERIFY_BASE_URL}/Services/${encodeURIComponent(provider.serviceSid)}/${operation.endpoint}`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${provider.apiKeySid}:${provider.apiKeySecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(operation.fields),
      signal: AbortSignal.timeout(PHONE_VERIFICATION_TIMEOUT_MS),
    },
  );
  let body: VerificationResponse = {};
  try {
    body = (await response.json()) as VerificationResponse;
  } catch {
    // A malformed provider response is treated as unavailable below.
  }
  return { ok: response.ok, status: response.status, body };
}

/**
 * Sends a one-time SMS code to a normalized E.164 number.
 *
 * @param phone - Verified-format E.164 destination.
 */
export async function startPhoneVerification(phone: string): Promise<void> {
  try {
    const result = await providerRequest({
      endpoint: "Verifications",
      fields: { To: phone, Channel: "sms" },
    });
    if (result.ok && result.body.status === "pending") return;
    logEvent("warn", "phone verification provider rejected send", {
      providerStatus: result.status,
      providerCode: result.body.code,
    });
  } catch (error) {
    if (error instanceof UsecaseError) throw error;
    logEvent("warn", "phone verification provider send failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
  throw new UsecaseError("unavailable", "phone verification is temporarily unavailable");
}

/**
 * Confirms a one-time code for a normalized E.164 number.
 *
 * @param phone - E.164 number the code was sent to.
 * @param code - Numeric code supplied by the user.
 */
export async function confirmPhoneVerification(phone: string, code: string): Promise<void> {
  if (!PHONE_VERIFICATION_CODE_PATTERN.test(code)) invalid("enter the verification code from the SMS");
  try {
    const result = await providerRequest({
      endpoint: "VerificationCheck",
      fields: { To: phone, Code: code },
    });
    if (result.ok && result.body.status === "approved") return;
    if (result.status < 500 && result.status !== 429) {
      invalid("that verification code is invalid or expired");
    }
    logEvent("warn", "phone verification provider check failed", {
      providerStatus: result.status,
      providerCode: result.body.code,
    });
  } catch (error) {
    if (error instanceof UsecaseError) throw error;
    logEvent("warn", "phone verification provider check failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
  throw new UsecaseError("unavailable", "phone verification is temporarily unavailable");
}
