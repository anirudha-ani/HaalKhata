/** Session signing, verification and key rotation, independent of account/provider flows. */

import crypto from "node:crypto";
import fileSystem from "node:fs";
import path from "node:path";
import { readSecret } from "@/server/common/secrets/secrets";
import {
  DATA_DIRECTORY,
  MIN_SESSION_SECRET_BYTES,
  SESSION_SECRET_BASE64_PATTERN,
  SESSION_SECRET_HEX_PATTERN,
  SESSION_TOKEN_FORMAT,
  TOKEN_LIFETIME_SECONDS,
} from "@/server/auth/auth.constants";

let cachedSecret: Buffer | null = null;
/** The previous signing key during a rotation; null when none is configured. */
let cachedPreviousSecret: Buffer | null | undefined;

/**
 * Strictly decodes standard Base64 without accepting Node's permissive
 * truncation of malformed input.
 *
 * @param configuredSecret - Possible padded or unpadded Base64 text.
 * @returns Decoded bytes for canonical Base64, otherwise null.
 */
function decodeCanonicalBase64(configuredSecret: string): Buffer | null {
  if (
    configuredSecret.length % 4 === 1 ||
    !SESSION_SECRET_BASE64_PATTERN.test(configuredSecret)
  ) {
    return null;
  }
  const candidate = Buffer.from(configuredSecret, "base64");
  const canonicalValue = candidate.toString("base64").replace(/=+$/, "");
  return canonicalValue === configuredSecret.replace(/=+$/, "") ? candidate : null;
}

/**
 * Decodes configured signing-key material and enforces a production length
 * floor. Canonical hex and standard Base64 are decoded so operator guidance
 * such as `openssl rand -hex 32` contributes the intended 256 random bits;
 * other values remain supported as UTF-8 passphrases.
 *
 * @param configuredSecret - SESSION_SECRET value supplied by the operator.
 * @param environment - Runtime environment; only production enforces the floor.
 * @returns Bytes used as the HMAC key.
 * @throws Error when production key material decodes to fewer than 32 bytes.
 */
export function decodeSessionSecret(
  configuredSecret: string,
  environment: string | undefined = process.env.NODE_ENV,
): Buffer {
  let decodedSecret: Buffer;
  if (SESSION_SECRET_HEX_PATTERN.test(configuredSecret)) {
    decodedSecret = Buffer.from(configuredSecret, "hex");
  } else {
    decodedSecret = decodeCanonicalBase64(configuredSecret) ?? Buffer.from(configuredSecret, "utf8");
  }

  if (environment === "production" && decodedSecret.byteLength < MIN_SESSION_SECRET_BYTES) {
    throw new Error(
      `SESSION_SECRET must contain at least ${MIN_SESSION_SECRET_BYTES} decoded bytes in production (use \`openssl rand -hex 32\`)`,
    );
  }
  return decodedSecret;
}

/**
 * Returns the decoded HMAC signing secret: SESSION_SECRET when set, otherwise
 * (dev only) a generated secret persisted under DATA_DIRECTORY so sessions
 * survive restarts. In production the readiness check invokes this function
 * and refuses to mark the container healthy without at least 32 decoded bytes.
 */
function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const configured = readSecret("SESSION_SECRET");
  if (configured) {
    cachedSecret = decodeSessionSecret(configured);
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set in production (use `openssl rand -hex 32`).",
    );
  }
  // Dev fallback: persist a generated secret so sessions survive restarts.
  const secretFilePath = path.join(DATA_DIRECTORY, ".secret");
  fileSystem.mkdirSync(DATA_DIRECTORY, { recursive: true });
  if (!fileSystem.existsSync(secretFilePath)) {
    fileSystem.writeFileSync(secretFilePath, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  cachedSecret = decodeSessionSecret(
    fileSystem.readFileSync(secretFilePath, "utf8").trim(),
    "development",
  );
  return cachedSecret;
}

/**
 * The previous signing key, kept for verification only while a rotation is
 * in flight. Set SESSION_SECRET_PREVIOUS (or _FILE) to the old key when
 * changing SESSION_SECRET and tokens issued under it stay valid until they
 * expire; unset it afterwards. Incident rotation leaves it unset, which
 * invalidates every session at once as before.
 *
 * @returns The decoded previous key, or null when none is configured.
 */
function previousSecret(): Buffer | null {
  if (cachedPreviousSecret !== undefined) return cachedPreviousSecret;
  const configured = readSecret("SESSION_SECRET_PREVIOUS");
  cachedPreviousSecret = configured ? decodeSessionSecret(configured) : null;
  return cachedPreviousSecret;
}

/**
 * Security domain bound into each signed token class — or, for
 * "rate-limit", into a keyed fingerprint that lets a limiter key on a phone
 * number without holding the number itself.
 */
export type TokenPurpose = "session" | "phone-merge" | "rate-limit" | "phone-code-log";

/**
 * Signs a purpose-bound payload. The NUL separator cannot appear in any token
 * field, so one token class can never validate as another even with the same
 * root secret.
 *
 * @param purpose - Token domain being authorized.
 * @param payload - Exact string being authorized.
 * @returns Its base64url HMAC-SHA256 signature.
 */
export function signPayload(purpose: TokenPurpose, payload: string): string {
  return signWith(secret(), purpose, payload);
}

/**
 * Signs a purpose-bound payload with one specific key.
 *
 * @param hmacKey - HMAC key.
 * @param purpose - Token domain being authorized.
 * @param payload - Exact string being authorized.
 * @returns Its base64url HMAC-SHA256 signature.
 */
function signWith(hmacKey: Buffer, purpose: TokenPurpose, payload: string): string {
  return crypto.createHmac("sha256", hmacKey).update(`${purpose}\0${payload}`).digest("base64url");
}

/**
 * Compares a purpose-bound signature in constant time, against the current
 * key and — during a rotation — the previous one, so a planned key change
 * does not sign everyone out at once.
 *
 * @param purpose - Token domain expected by the reader.
 * @param payload - Exact signed payload.
 * @param givenSignature - Base64url signature supplied with the token.
 * @returns True only for a same-purpose, same-payload signature under a live key.
 */
export function verifyPayloadSignature(
  purpose: TokenPurpose,
  payload: string,
  givenSignature: string,
): boolean {
  const givenBuffer = Buffer.from(givenSignature);
  const previous = previousSecret();
  const keys = previous ? [secret(), previous] : [secret()];
  let valid = false;
  for (const hmacKey of keys) {
    const expectedBuffer = Buffer.from(signWith(hmacKey, purpose, payload));
    // Every key is checked, so timing does not say which one matched.
    if (givenBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(givenBuffer, expectedBuffer)) {
      valid = true;
    }
  }
  return valid;
}

/**
 * Issues a signed bearer token for a user. The user's current token_version is
 * embedded so the token can be invalidated by bumping the version.
 *
 * @param userId - Id of the user the token authenticates.
 * @param tokenVersion - Current token_version of the user, baked into the payload.
 * @returns Token of the form "v2.userId.version.expiry.signature", valid for
 *   TOKEN_LIFETIME_SECONDS.
 */
export function createToken(userId: string, tokenVersion: number): string {
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  const payload = `${SESSION_TOKEN_FORMAT}.${userId}.${tokenVersion}.${expiresAtSeconds}`;
  return `${payload}.${signPayload("session", payload)}`;
}

/**
 * Returns the user id and embedded token version for a structurally valid,
 * unexpired, correctly-signed token, without consulting the database. Callers
 * must then verify the embedded version still matches the user's current row.
 *
 * @param token - Bearer token of the form "v2.userId.version.expiry.signature".
 * @returns The embedded user id and token version, or null when the signature
 *   or expiry check fails.
 */
export function verifyToken(token: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  if (!verifyPayloadSignature("session", payload, token.slice(lastDot + 1))) return null;
  const fields = payload.split(".");
  if (fields.length !== 4) return null;
  const [format, userId, versionText, expiresAtText] = fields;
  const version = Number(versionText);
  const expiresAt = Number(expiresAtText);
  if (
    format !== SESSION_TOKEN_FORMAT ||
    !userId ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Date.now() / 1000
  ) return null;
  return userId;
}

/**
 * Extracts the embedded token_version from a token string (without verifying
 * the signature). Used after verifyToken to compare against the DB row.
 *
 * @param token - Bearer token of the form "v2.userId.version.expiry.signature".
 * @returns The embedded version number, or NaN when the token is malformed.
 */
export function tokenVersion(token: string): number {
  const fields = token.split(".");
  if (fields.length !== 5 || fields[0] !== SESSION_TOKEN_FORMAT) return Number.NaN;
  const version = Number(fields[2]);
  return Number.isSafeInteger(version) && version >= 0 ? version : Number.NaN;
}

/**
 * Extracts the embedded expiry (Unix seconds) from a token string, without
 * verifying the signature. Used after verifyToken to decide whether the
 * session is old enough to renew.
 *
 * @param token - Bearer token of the form "v2.userId.version.expiry.signature".
 * @returns The expiry in Unix seconds, or NaN when the token is malformed.
 */
export function tokenExpiresAt(token: string): number {
  const fields = token.split(".");
  if (fields.length !== 5 || fields[0] !== SESSION_TOKEN_FORMAT) return Number.NaN;
  const expiresAt = Number(fields[3]);
  return Number.isSafeInteger(expiresAt) ? expiresAt : Number.NaN;
}
