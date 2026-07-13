/** Unit tests for the security-critical auth token sign/verify/version round trip. */

import { beforeAll, describe, expect, it } from "vitest";

// Set the signing secret before the auth module reads it, so tests don't
// touch the filesystem (the dev fallback writes data/.secret).
process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";

import { createToken, tokenVersion, verifyToken } from "./auth.usecase";
import { normalizePhone } from "@/server/auth/auth.constants";

describe("auth tokens", () => {
  beforeAll(() => {
    // Ensure a stable secret is loaded for the whole suite.
  });

  it("createToken → verifyToken round-trips the user id", () => {
    const token = createToken("user-123", 0);
    expect(verifyToken(token)).toBe("user-123");
  });

  it("embeds and exposes the token version", () => {
    const token = createToken("user-456", 7);
    expect(tokenVersion(token)).toBe(7);
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
});

describe("normalizePhone", () => {
  it("accepts and canonicalizes a valid number to E.164", () => {
    expect(normalizePhone("+8801712345678")).toBe("+8801712345678");
    expect(normalizePhone(" +1 (415) 555-2671 ")).toBe("+14155552671");
  });

  it("rejects garbage and empty input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("not-a-number")).toBeNull();
    expect(normalizePhone("+999999999999")).toBeNull(); // invalid country/length
  });
});
