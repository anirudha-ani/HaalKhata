/** Signature and encryption regression tests for Apple identity credentials. */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { encryptAppleToken, revokeAppleToken, verifyAppleIdentity } from "./apple.provider";
import { APPLE_ISSUER, APPLE_NATIVE_CLIENT_ID } from "../apple.constants";

let signingKey: CryptoKey;
let localKeys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const generated = await generateKeyPair("RS256");
  signingKey = generated.privateKey;
  localKeys = createLocalJWKSet({ keys: [{ ...await exportJWK(generated.publicKey), kid: "test-key", alg: "RS256" }] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/**
 * Issues an independently signed fixture to exercise real JWT verification.
 * @param overrides Claims to override for rejection tests.
 * @returns Signed Apple-shaped ID token.
 */
async function identityToken(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ sub: "apple-subject", email: "private@privaterelay.appleid.com", email_verified: "true",
    nonce: "n".repeat(43), iss: APPLE_ISSUER, aud: APPLE_NATIVE_CLIENT_ID,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(signingKey);
}

describe("Apple identity verification", () => {
  it("accepts a signed private-relay identity with verified email", async () => {
    await expect(verifyAppleIdentity(await identityToken(), APPLE_NATIVE_CLIENT_ID, localKeys)).resolves.toEqual({
      subject: "apple-subject", email: "private@privaterelay.appleid.com", nonce: "n".repeat(43),
    });
  });
  it.each([{ aud: "another.app" }, { iss: "https://attacker.example" }, { exp: 1 },
    { email_verified: false }, { nonce: "" }, { sub: "" }, { email: "invalid" }, { exp: undefined }])(
    "rejects invalid or incomplete claims %j", async (overrides) => {
      await expect(verifyAppleIdentity(await identityToken(overrides), APPLE_NATIVE_CLIENT_ID, localKeys))
        .rejects.toMatchObject({ code: "unauthenticated" });
    });
  it("rejects a modified signature", async () => {
    const original = await identityToken();
    const parts = original.split("."); parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
    await expect(verifyAppleIdentity(parts.join("."), APPLE_NATIVE_CLIENT_ID, localKeys)).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("Apple refresh token encryption", () => {
  it("requires a dedicated 256-bit key", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", "short");
    expect(() => encryptAppleToken("private-token")).toThrow("encryption is not configured");
  });
  it("uses a different ciphertext for every encryption and detects tampering", async () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", "a".repeat(64));
    const encrypted = encryptAppleToken("private-token");
    expect(encrypted).not.toContain("private-token");
    expect(encrypted).not.toEqual(encryptAppleToken("private-token"));
    const parts = encrypted.split("."); parts[2] = Buffer.alloc(16).toString("base64url");
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    await expect(revokeAppleToken(APPLE_NATIVE_CLIENT_ID, parts.join("."))).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
});
