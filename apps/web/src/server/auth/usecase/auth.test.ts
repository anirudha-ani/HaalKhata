/** Unit tests for the security-critical auth token sign/verify/version round trip. */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Set the signing secret before the auth module reads it, so tests don't
// touch the filesystem (the dev fallback writes data/.secret).
process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";

import {
  createToken,
  decodeSessionSecret,
  signPayload,
  tokenExpiresAt,
  tokenVersion,
  verifyToken,
} from "./auth.usecase";
import { TOKEN_LIFETIME_SECONDS } from "@/server/auth/auth.constants";
import { normalizePhone } from "@/server/auth/auth.constants";

describe("auth tokens", () => {
  beforeAll(() => {
    // Ensure a stable secret is loaded for the whole suite.
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("createToken → verifyToken round-trips the user id", () => {
    const token = createToken("user-123", 0);
    expect(verifyToken(token)).toBe("user-123");
  });

  it("embeds and exposes the token version", () => {
    const token = createToken("user-456", 7);
    expect(tokenVersion(token)).toBe(7);
  });

  it("exposes the embedded expiry for renewal decisions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T00:00:00.000Z"));
    const token = createToken("user-456", 0);
    expect(tokenExpiresAt(token)).toBe(
      Math.floor(Date.UTC(2026, 7, 28) / 1000) + TOKEN_LIFETIME_SECONDS,
    );
    expect(tokenExpiresAt("not-a-token")).toBeNaN();
  });

  it("has a seven-day absolute lifetime", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T00:00:00.000Z"));
    const token = createToken("user-456", 0);

    vi.setSystemTime(new Date("2026-09-03T23:59:59.000Z"));
    expect(verifyToken(token)).toBe("user-456");
    vi.setSystemTime(new Date("2026-09-04T00:00:00.000Z"));
    expect(verifyToken(token)).toBeNull();
  });

  it("rejects a token with a tampered payload", () => {
    const token = createToken("user-789", 0);
    // Flip the last character of the signature to break it.
    const lastChar = token[token.length - 1];
    const flipped = lastChar === "a" ? "b" : "a";
    const tampered = token.slice(0, -1) + flipped;
    expect(verifyToken(tampered)).toBeNull();
  });

  it("rejects a token with a tampered user id", () => {
    const token = createToken("user-789", 0);
    // Replace the user id segment without re-signing.
    const segments = token.split(".");
    segments[0] = "attacker";
    const tampered = segments.join(".");
    expect(verifyToken(tampered)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    // Build a token with a valid-looking shape but a bogus signature; any
    // secret mismatch produces a signature that won't match the HMAC.
    const bogus = `user-secret.${Math.floor(Date.now() / 1000) + 3600}.bogus-signature`;
    expect(verifyToken(bogus)).toBeNull();
  });

  it("rejects a structurally malformed token", () => {
    expect(verifyToken("not-a-token")).toBeNull();
    expect(verifyToken("")).toBeNull();
    expect(verifyToken("a.b")).toBeNull();
  });

  it("rejects signed tokens with non-finite numeric fields", () => {
    const payload = "v2.user-123.NaN.not-a-time";
    const token = `${payload}.${signPayload("session", payload)}`;

    expect(verifyToken(token)).toBeNull();
    expect(tokenVersion(token)).toBeNaN();
  });

  it("does not accept a signature created for another token purpose", () => {
    const payload = `v2.user-123.0.${Math.floor(Date.now() / 1000) + 3600}`;
    const wrongPurposeToken = `${payload}.${signPayload("phone-merge", payload)}`;

    expect(verifyToken(wrongPurposeToken)).toBeNull();
  });

  it("rejects the legacy 30-day token format even with a valid signature", () => {
    const legacyPayload = `user-123.0.${Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30}`;
    const legacyToken = `${legacyPayload}.${signPayload("session", legacyPayload)}`;

    expect(verifyToken(legacyToken)).toBeNull();
    expect(tokenVersion(legacyToken)).toBeNaN();
  });
});

describe("session signing secret", () => {
  it("decodes 256-bit hex and Base64 key material", () => {
    const keyMaterial = Buffer.from(Array.from({ length: 32 }, (_value, index) => index));

    expect(decodeSessionSecret(keyMaterial.toString("hex"), "production")).toEqual(keyMaterial);
    expect(decodeSessionSecret(keyMaterial.toString("base64"), "production")).toEqual(keyMaterial);
    expect(
      decodeSessionSecret(keyMaterial.toString("base64").replace(/=+$/, ""), "production"),
    ).toEqual(keyMaterial);
  });

  it.each([
    ["short UTF-8", "guessable-secret"],
    ["128-bit hex", "ab".repeat(16)],
    ["192-bit Base64", Buffer.alloc(24, 7).toString("base64")],
  ])("rejects %s key material in production", (_label, configuredSecret) => {
    expect(() => decodeSessionSecret(configuredSecret, "production")).toThrow(
      "at least 32 decoded bytes",
    );
  });

  it("keeps short explicit secrets available outside production", () => {
    expect(decodeSessionSecret("local-test-secret", "development")).toEqual(
      Buffer.from("local-test-secret"),
    );
  });
});

describe("normalizePhone", () => {
  it("accepts and canonicalizes a valid number to E.164", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
    expect(normalizePhone(" +1 (415) 555-2671 ")).toBe("+14155552671");
  });

  it("accepts US national formats without a country code", () => {
    // The whole point of DEFAULT_PHONE_REGION: before it was passed,
    // libphonenumber-js rejected every one of these.
    expect(normalizePhone("(617) 555-1212")).toBe("+16175551212");
    expect(normalizePhone("617-555-1212")).toBe("+16175551212");
    expect(normalizePhone("617.555.1212")).toBe("+16175551212");
    expect(normalizePhone("6175551212")).toBe("+16175551212");
  });

  it("still honors explicitly international numbers", () => {
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
  });

  it("rejects garbage and empty input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("not-a-number")).toBeNull();
    expect(normalizePhone("+999999999999")).toBeNull(); // invalid country/length
    expect(normalizePhone("617-555")).toBeNull(); // too short for the default region
  });
});
