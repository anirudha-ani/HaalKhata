/** Unit tests for the Twilio Verify possession-check boundary. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/common/logger", () => ({ logEvent: vi.fn(), logError: vi.fn() }));

import { logEvent } from "@/server/common/logger";
import {
  checkPhoneVerification,
  reportCodeLengthMismatch,
  startPhoneVerification,
} from "./phoneVerification";

const PHONE = "+16175551212";
const CODE = "48291375";

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
    vi.mocked(logEvent).mockClear();
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

  it("returns the verification a send reached, with when Twilio created it", async () => {
    vi.mocked(fetch).mockResolvedValue(
      providerResponse(201, {
        status: "pending",
        sid: "VE00000000000000000000000000000001",
        date_created: "2026-10-24T09:00:00Z",
      }),
    );

    await expect(startPhoneVerification(PHONE)).resolves.toEqual({
      sid: "VE00000000000000000000000000000001",
      createdAt: "2026-10-24T09:00:00Z",
    });
  });

  it("reports an answer without a usable id or date as unknown, not as a value", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(providerResponse(201, { status: "pending" }));
    await expect(startPhoneVerification(PHONE)).resolves.toEqual({ sid: null, createdAt: null });

    vi.mocked(fetch).mockResolvedValueOnce(
      providerResponse(201, { status: "pending", sid: "VE1", date_created: "yesterday-ish" }),
    );
    await expect(startPhoneVerification(PHONE)).resolves.toEqual({ sid: "VE1", createdAt: null });
  });

  it("reads an approved check as approved", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(200, { status: "approved" }));

    await expect(checkPhoneVerification(PHONE, CODE)).resolves.toBe("approved");
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(options?.body)).toBe(`To=%2B16175551212&Code=${CODE}`);
  });

  it("reads a still-pending verification as a wrong code", async () => {
    // Twilio answers a wrong code with 200 and the verification unchanged.
    vi.mocked(fetch).mockResolvedValue(providerResponse(200, { status: "pending" }));

    await expect(checkPhoneVerification(PHONE, CODE)).resolves.toBe("rejected");
  });

  it("reads a missing verification as gone", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(404, { code: 20404 }));

    await expect(checkPhoneVerification(PHONE, CODE)).resolves.toBe("gone");
  });

  it("reads an ended verification as gone", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(200, { status: "canceled" }));

    await expect(checkPhoneVerification(PHONE, CODE)).resolves.toBe("gone");
  });

  it("reads the provider's check limit as exhausted", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(429, { code: 60202, status: 429 }));

    await expect(checkPhoneVerification(PHONE, CODE)).resolves.toBe("exhausted");
  });

  it("treats provider rate limiting and outages as unavailable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(providerResponse(429, { code: 20429 }));
    await expect(checkPhoneVerification(PHONE, CODE)).rejects.toMatchObject({
      code: "unavailable",
    });

    vi.mocked(fetch).mockResolvedValueOnce(providerResponse(503, {}));
    await expect(checkPhoneVerification(PHONE, CODE)).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("never reports refused credentials as a wrong code", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(401, { code: 20003 }));

    await expect(checkPhoneVerification(PHONE, CODE)).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("never reports a request the provider refuses as a wrong code, and logs why", async () => {
    // 60200 is Twilio's invalid parameter: a setup problem, not a typo.
    vi.mocked(fetch).mockResolvedValue(providerResponse(400, { code: 60200 }));

    await expect(checkPhoneVerification(PHONE, CODE)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(logEvent).toHaveBeenCalledWith("warn", "phone verification provider check failed", {
      providerStatus: 400,
      providerCode: 60200,
    });
  });

  it("treats a 200 with no readable status as unavailable", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

    await expect(checkPhoneVerification(PHONE, CODE)).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("fails closed when provider credentials are missing", async () => {
    delete process.env.TWILIO_API_KEY_SECRET;

    await expect(startPhoneVerification("+16175551212")).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("warns when the Verify service texts codes of another length", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(200, { code_length: 6 }));

    await reportCodeLengthMismatch();

    const [requestUrl] = vi.mocked(fetch).mock.calls[0];
    expect(String(requestUrl)).toBe(
      "https://verify.twilio.com/v2/Services/VA00000000000000000000000000000000",
    );
    expect(logEvent).toHaveBeenCalledWith(
      "warn",
      "phone verification service texts codes of another length",
      { serviceCodeLength: 6, codeLength: 8 },
    );
  });

  it("says nothing when the Verify service texts our length", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(200, { code_length: 8 }));

    await reportCodeLengthMismatch();

    expect(logEvent).not.toHaveBeenCalled();
  });

  it("only notes a service it may not read", async () => {
    vi.mocked(fetch).mockResolvedValue(providerResponse(403, { code: 20003 }));

    await reportCodeLengthMismatch();

    expect(logEvent).toHaveBeenCalledWith("info", "phone verification service settings unreadable", {
      providerStatus: 403,
    });
  });

  it("asks nothing when phone verification is not configured", async () => {
    delete process.env.TWILIO_VERIFY_SERVICE_SID;

    await reportCodeLengthMismatch();

    expect(fetch).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});
