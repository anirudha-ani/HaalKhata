/** Auth business logic: scrypt passwords, HMAC bearer tokens, signup/login/profile flows. */

import crypto from "node:crypto";
import fileSystem from "node:fs";
import path from "node:path";
import { OAuth2Client } from "google-auth-library";
import {
  bumpTokenVersion,
  claimUser,
  findUserByEmail,
  findUserByGoogleSub,
  findUserById,
  findUserByPhone,
  insertUser,
  linkGoogleAccount,
  markOnboarded,
  setAvatarUrl,
  updateUserProfile,
  type UserRow,
} from "@/server/auth/repo/users.repo";
import { replacePaymentHandles } from "@/server/auth/repo/paymentHandles.repo";
import { PAYMENT_METHOD_KEYS } from "@haalkhata/shared/payment/methods";
import { UsecaseError, invalid } from "@/server/common/errors";
import {
  AVATAR_PALETTE,
  DATA_DIRECTORY,
  EMAIL_PATTERN,
  GOOGLE_CLIENT_ID,
  MAX_PAYMENT_HANDLE_LENGTH,
  MAX_USER_NAME_LENGTH,
  MIN_SESSION_SECRET_BYTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PHONE_FORMAT_HINT,
  SESSION_SECRET_BASE64_PATTERN,
  SESSION_SECRET_HEX_PATTERN,
  SESSION_TOKEN_FORMAT,
  TOKEN_LIFETIME_SECONDS,
  normalizePhone,
  passwordAuthEnabled,
} from "@/server/auth/auth.constants";
import { normalizeCurrencyCode } from "@/server/common/validation";
import { toPrivateUser } from "./user.mapper";

/**
 * Picks a stable avatar color for an email address by hashing it into the palette.
 *
 * @param email - Email address to derive the color from.
 * @returns A hex color from AVATAR_PALETTE, always the same for the same email.
 */
export function avatarColorFor(email: string): string {
  let hash = 0;
  for (const character of email) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// --- password hashing (scrypt) -------------------------------------------

/**
 * Validates password length bounds. scrypt has no built-in input cap, so a
 * huge password is both a CPU-DoS vector and a likely mistake; too short is
 * a weak account. Throws an invalid UsecaseError on violation.
 *
 * @param password - Plaintext password to validate.
 * @throws UsecaseError "invalid_argument" when the password is too short or too long.
 */
function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) invalid("password must be at least 6 characters");
  if (password.length > PASSWORD_MAX_LENGTH) invalid("password is too long");
}

/**
 * Hashes a plaintext password with scrypt and a random salt.
 *
 * @param password - Plaintext password to hash.
 * @returns Storable "salt:hash" string, both parts hex-encoded.
 */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Checks a plaintext password against a stored "salt:hash" string in constant time.
 *
 * @param password - Plaintext password supplied by the caller.
 * @param storedHash - Previously stored "salt:hash" string from the users table.
 * @returns True when the password matches the stored hash.
 */
function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

// --- bearer tokens ---------------------------------------------------------

let cachedSecret: Buffer | null = null;

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
  if (process.env.SESSION_SECRET) {
    cachedSecret = decodeSessionSecret(process.env.SESSION_SECRET);
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

/** Security domain bound into each signed token class. */
export type TokenPurpose = "session" | "phone-merge";

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
  return crypto
    .createHmac("sha256", secret())
    .update(`${purpose}\0${payload}`)
    .digest("base64url");
}

/**
 * Compares a purpose-bound signature in constant time.
 *
 * @param purpose - Token domain expected by the reader.
 * @param payload - Exact signed payload.
 * @param givenSignature - Base64url signature supplied with the token.
 * @returns True only for a same-purpose, same-payload signature.
 */
export function verifyPayloadSignature(
  purpose: TokenPurpose,
  payload: string,
  givenSignature: string,
): boolean {
  const expectedSignature = signPayload(purpose, payload);
  const givenBuffer = Buffer.from(givenSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  return (
    givenBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(givenBuffer, expectedBuffer)
  );
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

// --- flows -----------------------------------------------------------------

/**
 * Rejects the password flows on a production deploy, where Google is the only
 * way in. Enforced here rather than by hiding the form: the RPCs stay mounted
 * and reachable by anyone willing to POST at them, so the UI gate alone would
 * be decoration.
 *
 * @throws UsecaseError "permission_denied" when running in production.
 */
function requirePasswordAuthEnabled(): void {
  if (!passwordAuthEnabled()) {
    throw new UsecaseError("permission_denied", "sign in with Google to continue");
  }
}

/**
 * Registers a new account, or lets a shadow user claim their existing row,
 * and issues a session token. Exactly one of `email` or `phone` must be set;
 * the other is left null on the new account (and can be added later via
 * updateProfile once that supports it).
 *
 * @param input - Signup form values: email OR phone (E.164), display name, and plaintext password.
 * @returns The created (or claimed) user in proto shape plus a fresh session token.
 * @throws UsecaseError "invalid_argument" for a bad email/phone, empty name, or short password.
 * @throws UsecaseError "already_exists" when a registered account already uses that email/phone.
 */
export async function signUp(input: {
  email: string;
  phone: string;
  name: string;
  password: string;
}) {
  requirePasswordAuthEnabled();
  const name = input.name.trim();
  if (name.length === 0) invalid("name is required");
  if (name.length > MAX_USER_NAME_LENGTH) {
    invalid(`name is too long (max ${MAX_USER_NAME_LENGTH} characters)`);
  }
  validatePassword(input.password);

  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (email.length === 0 && !phone) {
    // The client routes one field into email-or-phone, so name whichever
    // shape it actually tried to parse rather than a generic "invalid".
    invalid(input.phone.trim() ? PHONE_FORMAT_HINT : "please enter an email address or phone number");
  }
  if (email.length > 0 && !EMAIL_PATTERN.test(email)) {
    invalid("please enter a valid email address");
  }
  // Avatar color derives from whichever identifier is present.
  const colorSeed = email || phone!;

  // Look up an existing (shadow or registered) account by whichever
  // identifier was supplied so a shadow user can claim their invited row.
  const existing = email ? await findUserByEmail(email) : await findUserByPhone(phone!);
  let user: UserRow;
  if (existing) {
    // google_sub counts as claimed too — otherwise an account that signed in
    // with Google (and so has no password) could be taken over through this
    // form by anyone who knows the address.
    if (existing.password_hash !== null || existing.google_sub !== null) {
      throw new UsecaseError("already_exists", "an account with this email or phone already exists");
    }
    // Shadow user invited earlier — claim the account (keeps expense history).
    await claimUser(existing.id, name, hashPassword(input.password));
    user = (await findUserById(existing.id))!;
  } else {
    user = await insertUser({
      email: email || null,
      name,
      avatarColor: avatarColorFor(colorSeed),
      passwordHash: hashPassword(input.password),
      phone: phone ?? null,
    });
  }
  return { user: toPrivateUser(user), token: createToken(user.id, user.token_version) };
}

/**
 * Authenticates an existing account and issues a session token. Exactly one of
 * `email` or `phone` must be set; the account is looked up by whichever is.
 *
 * @param input - Login form values: email OR phone, and plaintext password.
 * @returns The authenticated user in proto shape plus a fresh session token.
 * @throws UsecaseError "unauthenticated" when the identifier is unknown, the account is an
 *   unclaimed shadow user, or the password does not match.
 */
export async function logIn(input: { email: string; phone: string; password: string }) {
  requirePasswordAuthEnabled();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  const user = email ? await findUserByEmail(email) : phone ? await findUserByPhone(phone) : undefined;
  // Reject oversized passwords before running scrypt (CPU-DoS guard). An
  // unknown identifier or a too-long password both produce the same generic error.
  if (!user || user.password_hash === null || input.password.length > PASSWORD_MAX_LENGTH) {
    throw new UsecaseError("unauthenticated", "invalid email/phone or password");
  }
  if (!verifyPassword(input.password, user.password_hash)) {
    throw new UsecaseError("unauthenticated", "invalid email/phone or password");
  }
  return { user: toPrivateUser(user), token: createToken(user.id, user.token_version) };
}

// --- google sign-in --------------------------------------------------------

let cachedGoogleClient: OAuth2Client | null = null;

/**
 * Returns the shared Google OAuth client, which caches Google's public keys
 * across calls (a fresh client per request would refetch the JWKS every time).
 *
 * @returns The process-wide OAuth2Client.
 * @throws UsecaseError "invalid_argument" when GOOGLE_CLIENT_ID is unset, so a
 *   misconfigured deploy fails loudly on the first sign-in rather than
 *   verifying tokens against an empty audience.
 */
function googleClient(): OAuth2Client {
  if (GOOGLE_CLIENT_ID.length === 0) {
    throw new UsecaseError("invalid_argument", "Google sign-in is not configured on this server");
  }
  if (!cachedGoogleClient) cachedGoogleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  return cachedGoogleClient;
}

/**
 * Verifies a Google ID token and returns only the claims we trust from it.
 *
 * The library checks the signature against Google's rotating public keys plus
 * the issuer, audience and expiry; skipping any one of those would let a token
 * minted for a different app sign in here.
 *
 * @param idToken - Raw JWT credential produced by Google Identity Services.
 * @returns The stable account id, the verified email, the display name Google
 *   holds, and the profile picture URL — the last two empty when absent, which
 *   Google documents as always possible.
 * @throws UsecaseError "unauthenticated" when verification fails, the token
 *   carries no email, or that email is unverified.
 */
async function verifyGoogleIdToken(idToken: string): Promise<{
  googleSub: string;
  email: string;
  name: string;
  picture: string;
}> {
  // Resolved before the try: a missing GOOGLE_CLIENT_ID is a server
  // misconfiguration, and rewrapping it as "could not verify" would send an
  // operator hunting for a client-side problem that does not exist.
  const client = googleClient();
  let claims;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    claims = ticket.getPayload();
  } catch {
    // Bad signature, wrong audience, expired — all indistinguishable to the
    // caller on purpose, and none of them worth logging a stack trace over.
    throw new UsecaseError("unauthenticated", "could not verify that Google account");
  }
  if (!claims?.sub || !claims.email) {
    throw new UsecaseError("unauthenticated", "could not verify that Google account");
  }
  // Linking an existing row on an unverified address is account takeover:
  // anyone able to put someone else's address on a Google account would
  // inherit their ledger. Gmail is always verified; Workspace-hosted domains
  // are the case this actually guards.
  if (!claims.email_verified) {
    throw new UsecaseError("unauthenticated", "that Google account's email is not verified");
  }
  return {
    googleSub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    name: claims.name?.trim().slice(0, MAX_USER_NAME_LENGTH) ?? "",
    picture: claims.picture?.trim() ?? "",
  };
}

/**
 * Signs a user in with a Google ID token, linking or creating the account as
 * needed, and issues a session token.
 *
 * Three cases, in order: the Google account is already linked; its verified
 * email matches an existing row (a registered account, or a shadow user who
 * was invited earlier and now claims their expense history); or it is someone
 * new.
 *
 * @param idToken - Raw JWT credential produced by Google Identity Services.
 * @returns The signed-in user in proto shape plus a fresh session token.
 * @throws UsecaseError "unauthenticated" when the token fails verification.
 */
export async function logInWithGoogle(idToken: string) {
  const claims = await verifyGoogleIdToken(idToken);

  let user = await findUserByGoogleSub(claims.googleSub);
  if (!user) {
    const existing = await findUserByEmail(claims.email);
    if (existing) {
      // Safe because the email is verified: this row is only reachable by
      // whoever controls that mailbox. An unclaimed row also takes Google's
      // display name, since its own is a local-part placeholder.
      const unclaimed = existing.password_hash === null && existing.google_sub === null;
      await linkGoogleAccount(existing.id, claims.googleSub, unclaimed ? claims.name : "");
      user = (await findUserById(existing.id))!;
    } else {
      try {
        user = await insertUser({
          email: claims.email,
          name: claims.name || claims.email.split("@")[0],
          avatarColor: avatarColorFor(claims.email),
          passwordHash: null,
          googleSub: claims.googleSub,
          avatarUrl: claims.picture || null,
        });
      } catch (error) {
        // TOCTOU: a concurrent sign-in (double-clicked button, two tabs) won
        // the unique-index race on email or google_sub. Re-read rather than
        // surfacing a 500 for what is a successful sign-in either way.
        const databaseError = error as { code?: string };
        if (databaseError.code !== "23505") throw error;
        user =
          (await findUserByGoogleSub(claims.googleSub)) ?? (await findUserByEmail(claims.email))!;
      }
    }
  }

  // Applied after all three branches so a changed Google photo follows the
  // person on their next sign-in, not only when their row was first created.
  // These URLs are not contractually stable, so one stored and never refreshed
  // eventually points at nothing.
  if (claims.picture && claims.picture !== user.avatar_url) {
    await setAvatarUrl(user.id, claims.picture);
    user = { ...user, avatar_url: claims.picture };
  }

  return { user: toPrivateUser(user), token: createToken(user.id, user.token_version) };
}

/**
 * Fetches the calling user's profile.
 *
 * @param userId - Id of the authenticated caller.
 * @returns The user in proto shape.
 * @throws UsecaseError "unauthenticated" when the account row no longer exists.
 */
export async function getMe(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw new UsecaseError("unauthenticated", "account no longer exists");
  return toPrivateUser(user);
}

/**
 * Revokes the caller's outstanding bearer tokens by bumping token_version.
 *
 * @param userId - Id of the authenticated caller signing out.
 */
export async function logOut(userId: string): Promise<void> {
  await bumpTokenVersion(userId);
}

/**
 * Updates the calling user's display name and default currency.
 *
 * @param userId - Id of the authenticated caller.
 * @param input - New profile values; an empty defaultCurrency leaves the currency unchanged.
 * @returns The refreshed user in proto shape.
 * @throws UsecaseError "invalid_argument" when the trimmed name is empty.
 */
export async function updateProfile(
  userId: string,
  input: {
    name: string;
    defaultCurrency: string;
    paymentHandles?: { method: string; handle: string }[];
  },
) {
  const name = input.name.trim();
  if (name.length === 0) invalid("name is required");
  if (name.length > MAX_USER_NAME_LENGTH) {
    invalid(`name is too long (max ${MAX_USER_NAME_LENGTH} characters)`);
  }
  await updateUserProfile(userId, {
    name,
    defaultCurrency: input.defaultCurrency
      ? normalizeCurrencyCode(input.defaultCurrency)
      : undefined,
  });
  if (input.paymentHandles) {
    for (const entry of input.paymentHandles) {
      if (!PAYMENT_METHOD_KEYS.includes(entry.method)) {
        invalid(`unknown payment method "${entry.method}"`);
      }
      if (entry.handle.length > MAX_PAYMENT_HANDLE_LENGTH) {
        invalid(`that ${entry.method} handle is too long`);
      }
    }
    await replacePaymentHandles(userId, input.paymentHandles);
  }
  return getMe(userId);
}

/**
 * Resolves a raw session token to the user it belongs to, for server
 * components that guard routes.
 *
 * Unlike bare {@link verifyToken}, this checks the embedded token_version
 * against the row and rejects merge tombstones — so a signed-out-everywhere
 * cookie stops rendering the app shell before every RPC inside it fails.
 *
 * @param token - Raw session token from the cookie.
 * @returns The user in proto shape, or null when the token is not usable.
 */
export async function sessionUser(token: string) {
  const userId = verifyToken(token);
  if (!userId) return null;
  const user = await findUserById(userId);
  if (!user || user.merged_into !== null) return null;
  if (user.token_version !== tokenVersion(token)) return null;
  return toPrivateUser(user);
}

/**
 * Marks the caller's first-run flow finished, including when they skipped
 * every field. Deriving "done" from a filled-in profile column instead would
 * re-prompt forever anyone who declined.
 *
 * @param userId - Id of the authenticated caller.
 * @returns The refreshed user in proto shape.
 * @throws UsecaseError "unauthenticated" when the account row no longer exists.
 */
export async function completeOnboarding(userId: string) {
  await markOnboarded(userId);
  return getMe(userId);
}

/**
 * Finds a user by email or creates a claimable shadow user.
 *
 * @param email - Email address to look up, in any casing.
 * @param name - Optional display name for a newly created shadow user; defaults to
 *   the local part of the email.
 * @returns The existing or newly created users row.
 * @throws UsecaseError "invalid_argument" when the email is not a valid address.
 */
export async function findOrCreateUserByEmail(
  email: string,
  name?: string,
): Promise<UserRow> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail)) invalid("please enter a valid email address");
  const requestedName = name?.trim() ?? "";
  if (requestedName.length > MAX_USER_NAME_LENGTH) {
    invalid(`name is too long (max ${MAX_USER_NAME_LENGTH} characters)`);
  }
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) return existing;
  try {
    return await insertUser({
      email: normalizedEmail,
      name: requestedName || normalizedEmail.split("@")[0].slice(0, MAX_USER_NAME_LENGTH),
      avatarColor: avatarColorFor(normalizedEmail),
      passwordHash: null,
    });
  } catch (error) {
    // TOCTOU: a concurrent invite to the same email won the unique-index
    // race (Postgres SQLSTATE 23505). Re-read the now-existing row instead
    // of surfacing a 500 to the caller.
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") {
      const concurrent = await findUserByEmail(normalizedEmail);
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

/**
 * Finds a user by phone number or creates a claimable shadow user with no
 * email. The phone-number counterpart of {@link findOrCreateUserByEmail};
 * `users.email` is nullable and `chk_users_has_identifier` accepts a row that
 * carries only a phone, so such an invite is claimed at signup exactly the
 * way an email invite is.
 *
 * @param phone - Phone number in any format the user typed it.
 * @param name - Optional display name for a newly created shadow user;
 *   defaults to the normalized number.
 * @returns The existing or newly created users row.
 * @throws UsecaseError "invalid_argument" when the number is not a valid phone number.
 */
export async function findOrCreateUserByPhone(
  phone: string,
  name?: string,
): Promise<UserRow> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) invalid(PHONE_FORMAT_HINT);
  const requestedName = name?.trim() ?? "";
  if (requestedName.length > MAX_USER_NAME_LENGTH) {
    invalid(`name is too long (max ${MAX_USER_NAME_LENGTH} characters)`);
  }
  const existing = await findUserByPhone(normalizedPhone);
  if (existing) return existing;
  try {
    return await insertUser({
      email: null,
      phone: normalizedPhone,
      name: requestedName || normalizedPhone,
      avatarColor: avatarColorFor(normalizedPhone),
      passwordHash: null,
    });
  } catch (error) {
    // TOCTOU: a concurrent invite to the same number won the unique-index
    // race (Postgres SQLSTATE 23505). Re-read rather than surfacing a 500.
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") {
      const concurrent = await findUserByPhone(normalizedPhone);
      if (concurrent) return concurrent;
    }
    throw error;
  }
}
