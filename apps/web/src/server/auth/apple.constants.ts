/** Fixed Apple OAuth endpoints, challenge bounds and native app identity. */

/** Issuer accepted for Apple identity tokens. */
export const APPLE_ISSUER = "https://appleid.apple.com";
/** Rotating Apple signature verification keys. */
export const APPLE_KEYS_URL = `${APPLE_ISSUER}/auth/keys`;
/** Authorization-code exchange endpoint. */
export const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
/** Provider authorization revocation endpoint. */
export const APPLE_REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`;
/** Browser authorization endpoint. */
export const APPLE_AUTHORIZE_URL = `${APPLE_ISSUER}/auth/authorize`;
/** Registered native iOS bundle identifier. */
export const APPLE_NATIVE_CLIENT_ID = "com.haalkhata.app";
/** Maximum duration of one sign-in attempt. */
export const APPLE_CHALLENGE_SECONDS = 300;
/** Bound on each external Apple request. */
export const APPLE_TIMEOUT_MS = 10_000;
/** Lifetime of each locally signed client secret. */
export const APPLE_CLIENT_SECRET_SECONDS = 300;
/** Entropy in each nonce and callback state. */
export const APPLE_RANDOM_BYTES = 32;
/** Canonical 32-byte base64url proof shape. */
export const APPLE_NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Canonical SHA-256 digest or 256-bit hex key. */
export const APPLE_HASH_PATTERN = /^[a-f0-9]{64}$/;
/** Maximum accepted external credential size. */
export const APPLE_MAX_TOKEN_LENGTH = 16_384;
/** Fixed server callback route. */
export const APPLE_CALLBACK_PATH = "/api/auth/apple/callback";
/** Fixed native callback scheme and route. */
export const APPLE_MOBILE_RETURN = "haalkhata://login";
