/** SMS possession verification through Twilio Verify v2. */

import { isCompleteVerificationCode } from "@haalkhata/shared/phone/verificationCode";
import { UsecaseError, invalid } from "@/server/common/errors";
import { logEvent } from "@/server/common/logger";
import { readSecret } from "@/server/common/secrets/secrets";
import {
  PHONE_VERIFICATION_TIMEOUT_MS,
  TWILIO_ENDED_VERIFICATION_STATUSES,
  TWILIO_MAX_CHECK_ATTEMPTS_ERROR,
  TWILIO_VERIFY_BASE_URL,
} from "@/server/auth/auth.constants";

/** Minimal Twilio Verify response used by both start and check operations. */
interface VerificationResponse {
  status?: string;
  code?: number;
  /** The verification's id (VE…), on a send's answer. */
  sid?: string;
  /** When Twilio created the verification (ISO 8601), on a send's answer. */
  date_created?: string;
}

/** The verification a send reached, as far as the provider's answer says. */
export interface ProviderVerification {
  /** Twilio's id for it, or null when the answer did not carry one. */
  sid: string | null;
  /** When Twilio created it (ISO 8601), or null when missing or unreadable. */
  createdAt: string | null;
}

/** One provider answer: whether the call succeeded, its HTTP status, and the parsed body. */
interface ProviderResult {
  ok: boolean;
  status: number;
  body: VerificationResponse;
}

/** What the provider said about one code. */
export type PhoneCodeVerdict =
  /** The code is right: the number is proven. */
  | "approved"
  /** The code is wrong and the verification is still live. */
  | "rejected"
  /** The provider holds no live verification for the number: expired, approved before, or cancelled. */
  | "gone"
  /** The provider's own check limit for this verification is reached until it expires. */
  | "exhausted";

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
  const apiKeySecret = readSecret("TWILIO_API_KEY_SECRET").trim();
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
}): Promise<ProviderResult> {
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
 * Inside a verification's ten minutes Twilio answers with that same
 * verification and texts its code again; otherwise it creates a new one.
 * Which one it was is returned, so the server's record can follow it.
 *
 * @param phone - Verified-format E.164 destination.
 * @returns The verification the send reached.
 * @throws UsecaseError "unavailable" when the provider did not accept the send.
 */
export async function startPhoneVerification(phone: string): Promise<ProviderVerification> {
  try {
    const result = await providerRequest({
      endpoint: "Verifications",
      fields: { To: phone, Channel: "sms" },
    });
    if (result.ok && result.body.status === "pending") {
      const createdAt = result.body.date_created ?? "";
      return {
        sid: result.body.sid || null,
        createdAt: Number.isFinite(Date.parse(createdAt)) ? createdAt : null,
      };
    }
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
 * Reads the provider's answer to a code check. Twilio answers a wrong code
 * with 200 and the verification still "pending", a verification it no longer
 * holds with 404, a code it cannot read with 400, and its own check limit
 * with error 60202. Anything else, credentials it refuses included, is this
 * side's problem and must not reach the person as "wrong code".
 *
 * @param result - The provider's answer.
 * @returns The verdict, or undefined when the answer means the provider is unavailable.
 */
function readCheckVerdict(result: ProviderResult): PhoneCodeVerdict | undefined {
  if (result.body.code === TWILIO_MAX_CHECK_ATTEMPTS_ERROR) return "exhausted";
  if (result.ok) {
    if (result.body.status === "approved") return "approved";
    if (result.body.status === "pending") return "rejected";
    if (result.body.status === "max_attempts_reached") return "exhausted";
    if (TWILIO_ENDED_VERIFICATION_STATUSES.has(result.body.status ?? "")) return "gone";
    return undefined;
  }
  if (result.status === 404) return "gone";
  if (result.status === 400) return "rejected";
  return undefined;
}

/**
 * Asks the provider whether a code is right for a normalized E.164 number.
 * Only an unusable answer throws; every verdict is the caller's to word,
 * since the caller holds the attempt count and the expiry.
 *
 * @param phone - E.164 number the code was sent to.
 * @param code - The code the person entered, already checked for length.
 * @returns What the provider said about the code.
 * @throws UsecaseError "invalid_argument" for a code that is not a whole code,
 *   "unavailable" when the provider cannot answer.
 */
export async function checkPhoneVerification(
  phone: string,
  code: string,
): Promise<PhoneCodeVerdict> {
  if (!isCompleteVerificationCode(code)) invalid("enter the code from our latest text");
  try {
    const result = await providerRequest({
      endpoint: "VerificationCheck",
      fields: { To: phone, Code: code },
    });
    const verdict = readCheckVerdict(result);
    if (verdict === "gone" || verdict === "exhausted") {
      logEvent("warn", "phone verification provider ended the verification", {
        providerStatus: result.status,
        providerCode: result.body.code,
        verificationStatus: result.body.status,
      });
    }
    if (verdict) return verdict;
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
