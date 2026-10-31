/** Session signing, verification and key rotation, independent of account/provider flows. */

import crypto from "node:crypto";
import fileSystem from "node:fs";
import path from "node:path";
import { readSecret } from "@/server/common/secrets/secrets";
import {
  DATA_DIRECTORY,
  LEGACY_SESSION_TOKEN_FORMAT,
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
 * expire. A session moves to the new key the next time its owner opens the
 * app, and people can go months between bills, so unsetting it sooner than
 * the session lifetime signs out everyone who has not been back. Incident
 * rotation leaves it unset, which invalidates every session at once as before.
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
export type TokenPurpose = "session" | "ledger-cursor" | "rate-limit" | "phone-code-log";

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

/** What a session token says, signature aside. */
interface TokenFields {
  format: string;
  userId: string;
  version: number;
  /** The sign-in it belongs to; "" in the format that named none. */
  sessionId: string;
  expiresAt: number;
}

/**
 * Reads a token's fields in either format, without verifying anything.
 *
 * @param token - Session token.
 * @returns Its fields, or null when it has neither format's shape.
 */
function readToken(token: string): TokenFields | null {
  const fields = token.split(".");
  const format = fields[0];
  if (format === SESSION_TOKEN_FORMAT && fields.length === 6) {
    return { format, userId: fields[1], version: Number(fields[2]), sessionId: fields[3], expiresAt: Number(fields[4]) };
  }
  if (format === LEGACY_SESSION_TOKEN_FORMAT && fields.length === 5) {
    return { format, userId: fields[1], version: Number(fields[2]), sessionId: "", expiresAt: Number(fields[3]) };
  }
  return null;
}

/**
 * Issues a signed bearer token for one sign-in. The user's current
 * token_version is embedded too, so suspending an account ends every session
 * at once.
 *
 * @param userId - Id of the user the token authenticates.
 * @param tokenVersion - Current token_version of the user, baked into the payload.
 * @param sessionId - The sign-in's row in user_sessions.
 * @returns Token of the form "v3.userId.version.sessionId.expiry.signature",
 *   valid for TOKEN_LIFETIME_SECONDS.
 */
export function createToken(userId: string, tokenVersion: number, sessionId: string): string {
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  const payload = `${SESSION_TOKEN_FORMAT}.${userId}.${tokenVersion}.${sessionId}.${expiresAtSeconds}`;
  return `${payload}.${signPayload("session", payload)}`;
}

/**
 * Returns the user id for a structurally valid, unexpired, correctly-signed
 * token, without consulting the database. Callers must then check the session
 * is still live ({@link sessionIsLive}).
 *
 * @param token - Session token in either format.
 * @returns The embedded user id, or null when the signature or expiry check fails.
 */
export function verifyToken(token: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  if (!verifyPayloadSignature("session", token.slice(0, lastDot), token.slice(lastDot + 1))) return null;
  const fields = readToken(token);
  if (
    !fields ||
    !fields.userId ||
    !Number.isSafeInteger(fields.version) ||
    fields.version < 0 ||
    !Number.isSafeInteger(fields.expiresAt) ||
    fields.expiresAt <= Date.now() / 1000
  ) return null;
  return fields.userId;
}

/**
 * Extracts the embedded token_version from a token string (without verifying
 * the signature). Used after verifyToken to compare against the DB row.
 *
 * @param token - Session token in either format.
 * @returns The embedded version number, or NaN when the token is malformed.
 */
export function tokenVersion(token: string): number {
  const version = readToken(token)?.version ?? Number.NaN;
  return Number.isSafeInteger(version) && version >= 0 ? version : Number.NaN;
}

/**
 * Extracts the embedded expiry (Unix seconds) from a token string, without
 * verifying the signature. Used after verifyToken to decide whether the
 * session is old enough to renew.
 *
 * @param token - Session token in either format.
 * @returns The expiry in Unix seconds, or NaN when the token is malformed.
 */
export function tokenExpiresAt(token: string): number {
  const expiresAt = readToken(token)?.expiresAt ?? Number.NaN;
  return Number.isSafeInteger(expiresAt) ? expiresAt : Number.NaN;
}

/**
 * Whether a token is from before each sign-in had a row of its own.
 *
 * @param token - Session token.
 * @returns True for that older format.
 */
export function isLegacyToken(token: string): boolean {
  return readToken(token)?.format === LEGACY_SESSION_TOKEN_FORMAT;
}

/**
 * The sign-in a token belongs to. An older token names none, so its id comes
 * from the token itself: a page load sends several requests at once with the
 * same token, and each must arrive at the same row rather than make its own.
 *
 * @param token - Session token.
 * @returns The session's id.
 */
export function tokenSessionId(token: string): string {
  const named = readToken(token)?.sessionId;
  return named || `legacy-${crypto.createHash("sha256").update(token).digest("hex").slice(0, 40)}`;
}

/** What a session's row and its owner say about it; see sessions.repo. */
export interface SessionStanding {
  token_version: number;
  /** The account signed its older tokens out. */
  legacy_sessions_ended: boolean;
  session_found: boolean;
  session_ended: boolean;
}

/**
 * Whether a verified token's session is still live. The one rule, so the page
 * guard and the API guard cannot disagree. An older token with no row yet is
 * live, and gets its row on first use, unless its row says it was signed out.
 *
 * @param token - A verified session token.
 * @param standing - What the database says.
 * @returns True when the session may be used.
 */
export function sessionIsLive(token: string, standing: SessionStanding): boolean {
  if (standing.token_version !== tokenVersion(token) || standing.session_ended) return false;
  return isLegacyToken(token) ? !standing.legacy_sessions_ended : standing.session_found;
}
