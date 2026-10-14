/** Apple JWT verification, authorization-code exchange and encrypted revocation tokens. */

import crypto from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { readSecret } from "@/server/common/secrets/secrets";
import { UsecaseError } from "@/server/common/errors";
import { EMAIL_PATTERN } from "../../auth.constants";
import { APPLE_CLIENT_SECRET_SECONDS, APPLE_HASH_PATTERN, APPLE_ISSUER, APPLE_KEYS_URL,
  APPLE_MAX_TOKEN_LENGTH, APPLE_NONCE_PATTERN, APPLE_REVOKE_URL, APPLE_TIMEOUT_MS,
  APPLE_TOKEN_URL } from "../../apple.constants";

const appleKeys = createRemoteJWKSet(new URL(APPLE_KEYS_URL), { timeoutDuration: APPLE_TIMEOUT_MS });

/** Verified identity fields; never accepted from client-reported profile data. */
export interface AppleIdentity { subject: string; email: string; nonce: string }

/**
 * Verifies signature, algorithm, issuer, audience, expiry and required identity claims.
 * @param identityToken Apple-signed JWT.
 * @param clientId Exact client that requested the challenge.
 * @param keySet Apple key resolver; injectable for signature regression tests.
 * @returns Verified identity and server nonce.
 */
export async function verifyAppleIdentity(identityToken: string, clientId: string,
  keySet: JWTVerifyGetKey = appleKeys): Promise<AppleIdentity> {
  try {
    if (identityToken.length > APPLE_MAX_TOKEN_LENGTH) throw new Error("oversized token");
    const { payload } = await jwtVerify(identityToken, keySet, {
      algorithms: ["RS256"], issuer: APPLE_ISSUER, audience: clientId,
      requiredClaims: ["exp", "iat", "sub", "nonce"],
    });
    if (!payload.sub || typeof payload.nonce !== "string" || !APPLE_NONCE_PATTERN.test(payload.nonce) ||
        typeof payload.email !== "string" || !EMAIL_PATTERN.test(payload.email) ||
        ![true, "true"].includes(payload.email_verified as boolean | string)) throw new Error("invalid claims");
    return { subject: payload.sub, email: payload.email.trim().toLowerCase(), nonce: payload.nonce };
  } catch {
    throw new UsecaseError("unauthenticated", "could not verify that Apple account");
  }
}

/**
 * Signs a short-lived Apple client secret with the operator's private key.
 * @param clientId App ID or Services ID.
 * @returns ES256 client-secret JWT.
 */
async function clientSecret(clientId: string): Promise<string> {
  const privateKey = readSecret("APPLE_PRIVATE_KEY");
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  if (!privateKey || !teamId || !keyId) throw new UsecaseError("unavailable", "Apple sign-in is not configured");
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId).setSubject(clientId).setAudience(APPLE_ISSUER).setIssuedAt()
    .setExpirationTime(`${APPLE_CLIENT_SECRET_SECONDS}s`)
    .sign(await importPKCS8(privateKey, "ES256"));
}

/**
 * Verifies native/browser signing and encrypted credential storage before deployment is ready.
 * @returns Resolves when all Apple release configuration is usable.
 */
export async function assertAppleSignInConfigured(): Promise<void> {
  const serviceId = process.env.APPLE_SERVICE_ID;
  if (!serviceId) throw new Error("APPLE_SERVICE_ID is required for Apple browser sign-in");
  await clientSecret(serviceId);
  encryptAppleToken("readiness-probe");
}

/**
 * Exchanges a one-use Apple authorization code for identity and revocation credentials.
 * @param authorizationCode Code from native Apple sign-in or the verified browser callback.
 * @param clientId Client bound into the original challenge.
 * @param redirectUri Browser callback URL; omitted for native iOS.
 * @returns Apple-issued identity and refresh tokens.
 */
export async function exchangeAppleCode(authorizationCode: string, clientId: string, redirectUri?: string) {
  if (!authorizationCode || authorizationCode.length > APPLE_MAX_TOKEN_LENGTH) {
    throw new UsecaseError("unauthenticated", "Apple did not return an authorization code");
  }
  const parameters = new URLSearchParams({ client_id: clientId, client_secret: await clientSecret(clientId),
    code: authorizationCode, grant_type: "authorization_code" });
  if (redirectUri) parameters.set("redirect_uri", redirectUri);
  try {
    const response = await fetch(APPLE_TOKEN_URL, { method: "POST", body: parameters,
      signal: AbortSignal.timeout(APPLE_TIMEOUT_MS) });
    if (!response.ok) throw new Error("code exchange failed");
    const result = await response.json() as { id_token?: string; refresh_token?: string };
    if (!result.id_token || !result.refresh_token) throw new Error("missing tokens");
    return { identityToken: result.id_token, refreshToken: result.refresh_token };
  } catch {
    throw new UsecaseError("unavailable", "Apple sign-in could not finish. Please try again.");
  }
}

/**
 * Reads the dedicated 256-bit encryption key; session key rotations do not affect it.
 * @returns AES key bytes.
 */
function encryptionKey(): Buffer {
  const configuredKey = readSecret("APPLE_TOKEN_ENCRYPTION_KEY") ?? "";
  if (!APPLE_HASH_PATTERN.test(configuredKey)) {
    throw new UsecaseError("unavailable", "Apple token encryption is not configured");
  }
  return Buffer.from(configuredKey, "hex");
}

/**
 * Encrypts a revocation credential with a fresh IV and authenticated encryption.
 * @param token Refresh token issued by Apple.
 * @returns Versioned IV, authentication tag and ciphertext.
 */
export function encryptAppleToken(token: string): string {
  const initializationVector = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), initializationVector);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", initializationVector.toString("base64url"), cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")].join(".");
}

/**
 * Revokes Apple authorization before its local account credentials are erased.
 * @param clientId Original token audience.
 * @param encryptedToken Stored authenticated ciphertext.
 * @returns Resolves after Apple's successful or already-revoked response.
 */
export async function revokeAppleToken(clientId: string, encryptedToken: string): Promise<void> {
  const [version, initializationVector, authenticationTag, ciphertext] = encryptedToken.split(".");
  if (version !== "v1" || !initializationVector || !authenticationTag || !ciphertext) throw new Error("invalid Apple credential");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(initializationVector, "base64url"));
  decipher.setAuthTag(Buffer.from(authenticationTag, "base64url"));
  const token = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  const response = await fetch(APPLE_REVOKE_URL, { method: "POST", signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
    body: new URLSearchParams({ client_id: clientId, client_secret: await clientSecret(clientId),
      token, token_type_hint: "refresh_token" }) });
  if (!response.ok) throw new UsecaseError("unavailable", "Apple access could not be revoked. Please try account deletion again.");
}
