/** Unit tests for the Twilio Verify possession-check boundary. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmPhoneVerification, startPhoneVerification } from "./phoneVerification";

/** Builds a JSON response from the provider. */
function providerResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("phone verification", () => {
  beforeEach(() => {
    process.env.TWILIO_API_KEY_SID = "SK00000000000000000000000000000000";
    process.env.TWILIO_API_KEY_SECRET = "test-api-secret";
    process.env.TWILIO_VERIFY_SERVICE_SID = "VA00000000000000000000000000000000";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TWILIO_API_KEY_SID;
    delete process.env.TWILIO_API_KEY_SECRET;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
  });

  it("starts an SMS verification without exposing credentials in the URL", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(201, { status: "pending" }));

    await startPhoneVerification("+16175551212");

    const [requestUrl, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(requestUrl)).toBe(
      "https://verify.twilio.com/v2/Services/VA00000000000000000000000000000000/Verifications",
    );
    expect(String(options?.body)).toBe("To=%2B16175551212&Channel=sms");
    expect(options?.headers).toMatchObject({ "content-type": "application/x-www-form-urlencoded" });
  });

  it("accepts only an approved verification check", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(200, { status: "approved" }));

    await expect(confirmPhoneVerification("+16175551212", "123456")).resolves.toBeUndefined();
  });

  it("fails closed when provider credentials are missing", async () => {
    delete process.env.TWILIO_API_KEY_SECRET;

    await expect(startPhoneVerification("+16175551212")).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed codes before calling the provider", async () => {
    await expect(confirmPhoneVerification("+16175551212", "12ab")).rejects.toMatchObject({
      code: "invalid_argument",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps an expired or incorrect code to a safe validation error", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(404, { code: 20404 }));

    await expect(confirmPhoneVerification("+16175551212", "123456")).rejects.toMatchObject({
      code: "invalid_argument",
      message: "that verification code is invalid or expired",
    });
  });
});
