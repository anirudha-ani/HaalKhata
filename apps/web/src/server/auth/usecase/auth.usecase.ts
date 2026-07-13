/** Auth business logic: scrypt passwords, HMAC bearer tokens, signup/login/profile flows. */

import crypto from "node:crypto";
import fileSystem from "node:fs";
import path from "node:path";
import {
  claimUser,
  findUserByEmail,
  findUserById,
  insertUser,
  updateUserProfile,
  type UserRow,
} from "@/server/auth/repo/users.repo";
import { UsecaseError, invalid } from "@/server/common/errors";
import {
  AVATAR_PALETTE,
  DATA_DIRECTORY,
  EMAIL_PATTERN,
  TOKEN_LIFETIME_SECONDS,
} from "@/server/auth/auth.constants";
import { toUser } from "./user.mapper";

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
 * Returns the HMAC signing secret: SESSION_SECRET when set, otherwise a
 * dev fallback persisted under DATA_DIRECTORY so sessions survive restarts.
 */
function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  if (process.env.SESSION_SECRET) {
    cachedSecret = Buffer.from(process.env.SESSION_SECRET, "utf8");
    return cachedSecret;
  }
  // Dev fallback: persist a generated secret so sessions survive restarts.
  const secretFilePath = path.join(DATA_DIRECTORY, ".secret");
  fileSystem.mkdirSync(DATA_DIRECTORY, { recursive: true });
  if (!fileSystem.existsSync(secretFilePath)) {
    fileSystem.writeFileSync(secretFilePath, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  cachedSecret = Buffer.from(fileSystem.readFileSync(secretFilePath, "utf8").trim(), "utf8");
  return cachedSecret;
}

/** Computes the base64url HMAC-SHA256 signature for a token payload. */
function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Issues a signed bearer token for a user.
 *
 * @param userId - Id of the user the token authenticates.
 * @returns Token of the form "userId.expiry.signature", valid for TOKEN_LIFETIME_SECONDS.
 */
export function createToken(userId: string): string {
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  const payload = `${userId}.${expiresAtSeconds}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Returns the user id for a valid, unexpired token; null otherwise.
 *
 * @param token - Bearer token of the form "userId.expiry.signature".
 * @returns The embedded user id, or null when the signature or expiry check fails.
 */
export function verifyToken(token: string): string | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const givenSignature = token.slice(lastDot + 1);
  const expectedSignature = sign(payload);
  const givenBuffer = Buffer.from(givenSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (givenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(givenBuffer, expectedBuffer)) return null;
  const [userId, expiresAtText] = payload.split(".");
  if (!userId || Number(expiresAtText) < Date.now() / 1000) return null;
  return userId;
}

// --- flows -----------------------------------------------------------------

/**
 * Registers a new account, or lets a shadow user claim their existing row,
 * and issues a session token.
 *
 * @param input - Signup form values: email, display name, and plaintext password.
 * @returns The created (or claimed) user in proto shape plus a fresh session token.
 * @throws UsecaseError "invalid_argument" for a bad email, empty name, or short password.
 * @throws UsecaseError "already_exists" when a registered account already uses the email.
 */
export async function signUp(input: { email: string; name: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL_PATTERN.test(email)) invalid("please enter a valid email address");
  if (name.length === 0) invalid("name is required");
  if (input.password.length < 6) invalid("password must be at least 6 characters");

  const existing = await findUserByEmail(email);
  let user: UserRow;
  if (existing) {
    if (existing.password_hash !== null) {
      throw new UsecaseError("already_exists", "an account with this email already exists");
    }
    // Shadow user invited earlier — claim the account (keeps expense history).
    await claimUser(existing.id, name, hashPassword(input.password));
    user = (await findUserById(existing.id))!;
  } else {
    user = await insertUser({
      email,
      name,
      avatarColor: avatarColorFor(email),
      passwordHash: hashPassword(input.password),
    });
  }
  return { user: toUser(user), token: createToken(user.id) };
}

/**
 * Authenticates an existing account and issues a session token.
 *
 * @param input - Login form values: email and plaintext password.
 * @returns The authenticated user in proto shape plus a fresh session token.
 * @throws UsecaseError "unauthenticated" when the email is unknown, the account is an
 *   unclaimed shadow user, or the password does not match.
 */
export async function logIn(input: { email: string; password: string }) {
  const user = await findUserByEmail(input.email.trim().toLowerCase());
  if (!user || user.password_hash === null || !verifyPassword(input.password, user.password_hash)) {
    throw new UsecaseError("unauthenticated", "invalid email or password");
  }
  return { user: toUser(user), token: createToken(user.id) };
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
  return toUser(user);
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
  input: { name: string; defaultCurrency: string },
) {
  if (input.name.trim().length === 0) invalid("name is required");
  await updateUserProfile(userId, {
    name: input.name.trim(),
    defaultCurrency: input.defaultCurrency || undefined,
  });
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
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) return existing;
  return insertUser({
    email: normalizedEmail,
    name: name?.trim() || normalizedEmail.split("@")[0],
    avatarColor: avatarColorFor(normalizedEmail),
    passwordHash: null,
  });
}
