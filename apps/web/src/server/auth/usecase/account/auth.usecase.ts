/** Account business logic: password/Google sign-in, onboarding and profile changes. */

import { assertSafeText } from "@/server/safety/usecase/contentFilter";
import { providerDisplayName } from "../identity/providerDisplayName";
import crypto from "node:crypto";
import { createToken, verifyToken, tokenVersion } from "../session/session";
import { promisify } from "node:util";
import { OAuth2Client } from "google-auth-library";
import {
  bumpTokenVersion,
  findUserByEmail,
  findUserByGoogleSub,
  findUserById,
  findUserByPhone,
  insertUser,
  linkGoogleAccount,
  markOnboarded,
  setAvatarUrl,
  setUserPhone,
  updateUserProfile,
  type UserRow,
} from "@/server/auth/repo/users.repo";
import {
  consumeGoogleSignInNonce,
  insertGoogleSignInNonce,
} from "@/server/auth/repo/google/googleSignInNonces.repo";
import { UsecaseError, invalid } from "@/server/common/errors";
import {
  AVATAR_PALETTE,
  EMAIL_PATTERN,
  GOOGLE_AUDIENCES,
  GOOGLE_CLIENT_ID,
  GOOGLE_SIGN_IN_INTERRUPTED_MESSAGE,
  GOOGLE_SIGN_IN_NONCE_BYTES,
  GOOGLE_SIGN_IN_NONCE_LIFETIME_SECONDS,
  GOOGLE_SIGN_IN_NONCE_PATTERN,
  PAYMENT_HANDLES_RETIRED_MESSAGE,
  MAX_USER_NAME_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PHONE_FORMAT_HINT,
  normalizePhone,
  passwordAuthEnabled,
} from "@/server/auth/auth.constants";
import { normalizeCurrencyCode } from "@/server/common/validation/validation";
import { isUniqueViolation } from "@/server/common/db/db";
import { toPrivateUser } from "../identity/user.mapper";

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

/**
 * Trims a display name and enforces the shared length bound. Empty stays
 * legal here — whether a name is required differs by flow, so that check
 * belongs to {@link requireName}.
 *
 * @param rawName - Name text as the client sent it.
 * @returns The trimmed name, possibly "".
 * @throws UsecaseError "invalid_argument" when the trimmed name is too long.
 */
function normalizeName(rawName: string): string {
  assertSafeText(rawName);
  const name = rawName.trim();
  if (name.length > MAX_USER_NAME_LENGTH) {
    invalid(`name is too long (max ${MAX_USER_NAME_LENGTH} characters)`);
  }
  return name;
}

/**
 * Like {@link normalizeName}, for the flows where a person must have a name.
 *
 * @param rawName - Name text as the client sent it.
 * @returns The trimmed, non-empty name.
 * @throws UsecaseError "invalid_argument" when the name is empty or too long.
 */
function requireName(rawName: string): string {
  const name = normalizeName(rawName);
  if (name.length === 0) invalid("name is required");
  return name;
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
  if (password.length < PASSWORD_MIN_LENGTH) {
    invalid(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) invalid("password is too long");
}

/** scrypt on the thread pool: a hash must never block the event loop for every other request. */
const scrypt = promisify<string, string, number, Buffer>(crypto.scrypt);

/**
 * Hashes a plaintext password with scrypt and a random salt.
 *
 * @param password - Plaintext password to hash.
 * @returns Storable "salt:hash" string, both parts hex-encoded.
 */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Checks a plaintext password against a stored "salt:hash" string in constant time.
 *
 * @param password - Plaintext password supplied by the caller.
 * @param storedHash - Previously stored "salt:hash" string from the users table.
 * @returns True when the password matches the stored hash.
 */
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

// --- flows -----------------------------------------------------------------

/**
 * Rejects the password flows on a production deploy, which uses Google and
 * Apple. Enforced here rather than by hiding the form: the RPCs stay mounted
 * and reachable by anyone willing to POST at them, so the UI gate alone would
 * be decoration.
 *
 * @throws UsecaseError "permission_denied" when running in production.
 */
function requirePasswordAuthEnabled(): void {
  if (!passwordAuthEnabled()) {
    throw new UsecaseError("permission_denied", "sign in with Google or Apple to continue");
  }
}

/**
 * Registers a new account and issues a session token. Exactly one of
 * `email` or `phone` must be set; the other is left null on the new account
 * (and can be added later via updateProfile once that supports it).
 *
 * @param input - Signup form values: email OR phone (E.164), display name, and plaintext password.
 * @returns The created user in proto shape plus a fresh session token.
 * @throws UsecaseError "invalid_argument" for a bad email/phone, empty name, or short password.
 * @throws UsecaseError "already_exists" when an account already uses that email/phone.
 */
export async function signUp(input: {
  email: string;
  phone: string;
  name: string;
  password: string;
}) {
  requirePasswordAuthEnabled();
  const name = requireName(input.name);
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

  // Whoever already holds the identifier signed up for it; this form never
  // takes over an existing row, whatever credential it has.
  const existing = email ? await findUserByEmail(email) : await findUserByPhone(phone!);
  if (existing) {
    throw new UsecaseError("already_exists", "an account with this email or phone already exists");
  }
  const user = await insertUser({
    email: email || null,
    name,
    avatarColor: avatarColorFor(colorSeed),
    passwordHash: await hashPassword(input.password),
    phone: phone ?? null,
  });
  return { user: toPrivateUser(user), token: createToken(user.id, user.token_version) };
}

/**
 * Authenticates an existing account and issues a session token. Exactly one of
 * `email` or `phone` must be set; the account is looked up by whichever is.
 *
 * @param input - Login form values: email OR phone, and plaintext password.
 * @returns The authenticated user in proto shape plus a fresh session token.
 * @throws UsecaseError "unauthenticated" when the identifier is unknown, the account has
 *   no password, or the password does not match.
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
  if (!(await verifyPassword(input.password, user.password_hash))) {
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
 * Hashes a Google authentication nonce before it crosses the repository
 * boundary, so a database read cannot reveal a still-usable raw challenge.
 *
 * @param nonce - Raw server-issued nonce.
 * @returns Lowercase hexadecimal SHA-256 digest.
 */
function googleSignInNonceHash(nonce: string): string {
  return crypto.createHash("sha256").update(nonce, "utf8").digest("hex");
}

/**
 * Issues and persists a short-lived challenge for one Google sign-in attempt.
 *
 * @returns The raw nonce the client must include in Google's ID-token request.
 * @throws UsecaseError "invalid_argument" when Google sign-in is not configured.
 */
export async function beginGoogleSignIn(): Promise<{ nonce: string }> {
  googleClient();
  const nonce = crypto.randomBytes(GOOGLE_SIGN_IN_NONCE_BYTES).toString("base64url");
  await insertGoogleSignInNonce(
    googleSignInNonceHash(nonce),
    GOOGLE_SIGN_IN_NONCE_LIFETIME_SECONDS,
  );
  return { nonce };
}

/**
 * Verifies a Google ID token and returns only the claims we trust from it.
 *
 * The library checks the signature against Google's rotating public keys plus
 * the issuer, audience and expiry; skipping any one of those would let a token
 * minted for a different app sign in here.
 *
 * @param idToken - Raw JWT credential produced by Google Identity Services.
 * @param audiences - Client ids the token may have been minted for.
 * @returns The stable account id, the verified email, the display name Google
 *   holds, the profile picture URL, and the server-issued authentication nonce.
 *   The name and picture are empty when absent, which Google documents as possible.
 * @throws UsecaseError "unauthenticated" when verification fails, the token
 *   carries no email, or that email is unverified.
 */
async function verifyGoogleIdToken(
  idToken: string,
  audiences: readonly string[],
): Promise<{
  googleSub: string;
  email: string;
  name: string;
  picture: string;
  nonce: string;
}> {
  // Resolved before the try: a missing GOOGLE_CLIENT_ID is a server
  // misconfiguration, and rewrapping it as "could not verify" would send an
  // operator hunting for a client-side problem that does not exist.
  const client = googleClient();
  let claims;
  try {
    // The web client and the native mobile clients each mint tokens naming
    // themselves as audience; any of them is this app.
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [...audiences],
    });
    claims = ticket.getPayload();
  } catch {
    // Bad signature, wrong audience, expired — all indistinguishable to the
    // caller on purpose, and none of them worth logging a stack trace over.
    throw new UsecaseError("unauthenticated", "could not verify that Google account");
  }
  if (
    !claims?.sub ||
    !claims.email ||
    !claims.nonce ||
    !GOOGLE_SIGN_IN_NONCE_PATTERN.test(claims.nonce)
  ) {
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
    nonce: claims.nonce,
  };
}

/** The identity a verified Google sign-in establishes. */
export interface GoogleIdentity {
  /** Google's stable account id (the token's `sub`). */
  googleSub: string;
  /** The verified email, trimmed and lowercased. */
  email: string;
  /** Display name Google holds; empty when absent. */
  name: string;
  /** Profile picture URL; empty when absent. */
  picture: string;
}

/**
 * Establishes who is signing in: verifies a Google ID token and spends the
 * server-issued nonce it carries, so the same token cannot be replayed.
 *
 * This is the whole of "prove a Google identity" and nothing of "what to do
 * with it". The app's sign-in turns the identity into an account and a
 * session; the admin surface checks it against an allowlist and never
 * touches an account. Both must verify and spend the nonce the same way,
 * which is why they share this rather than each keeping a copy.
 *
 * @param idToken - Raw JWT credential produced by Google Identity Services.
 * @param audiences - Client ids the token may have been minted for; every
 *   client of this app by default.
 * @returns The verified identity.
 * @throws UsecaseError "unauthenticated" when the token fails verification
 *   or its nonce is unknown, expired or already used.
 */
export async function verifyGoogleSignIn(
  idToken: string,
  audiences: readonly string[] = GOOGLE_AUDIENCES,
): Promise<GoogleIdentity> {
  const claims = await verifyGoogleIdToken(idToken, audiences);
  const nonceAccepted = await consumeGoogleSignInNonce(googleSignInNonceHash(claims.nonce));
  if (!nonceAccepted) {
    throw new UsecaseError("unauthenticated", "could not verify that Google account");
  }
  return {
    googleSub: claims.googleSub,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  };
}

/**
 * Signs a user in with a Google ID token, linking or creating the account as
 * needed, and issues a session token.
 *
 * Three cases, in order: the Google account is already linked; its verified
 * email matches an existing account, which Google is then linked to; or it
 * is someone new.
 *
 * @param idToken - Raw JWT credential produced by Google Identity Services.
 * @returns The signed-in user in proto shape plus a fresh session token.
 * @throws UsecaseError "unauthenticated" when the token fails verification.
 */
export async function logInWithGoogle(idToken: string) {
  const claims = await verifyGoogleSignIn(idToken);

  let user = await findUserByGoogleSub(claims.googleSub);
  if (!user) {
    const existing = await findUserByEmail(claims.email);
    // Safe because the email is verified: this account is only reachable by
    // whoever controls that mailbox, and it keeps the name they chose. The
    // link comes back empty when the account was deleted after it was found;
    // the person then signs up afresh, as they would a moment later.
    user = existing ? await linkGoogleAccount(existing.id, claims.googleSub) : undefined;
    user ??= await insertGoogleUser(claims);
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
 * Creates the account for a Google identity no live account holds.
 *
 * A concurrent sign-in (a double-clicked button, two tabs) can win the
 * unique-index race on email or google_sub; the account it made is then
 * this person's too, so it is read back rather than failing what is a
 * successful sign-in either way.
 *
 * @param claims - The verified Google identity.
 * @returns The new account, or the one the concurrent sign-in made.
 * @throws UsecaseError "unavailable" when that account is gone again by the
 *   time it is read back, so the person is asked to try once more.
 */
async function insertGoogleUser(claims: GoogleIdentity): Promise<UserRow> {
  try {
    return await insertUser({
      email: claims.email,
      name: providerDisplayName(claims.name),
      avatarColor: avatarColorFor(claims.email),
      passwordHash: null,
      googleSub: claims.googleSub,
      avatarUrl: claims.picture || null,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = (await findUserByGoogleSub(claims.googleSub)) ?? (await findUserByEmail(claims.email));
    if (!winner) throw new UsecaseError("unavailable", GOOGLE_SIGN_IN_INTERRUPTED_MESSAGE);
    return winner;
  }
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
 * Payment handles used to ride along on this request. They are now payment
 * methods with their own service, and a request that still carries a handle
 * comes from a client loaded before the change. It is refused whole rather
 * than saved without the handle: a form that says "Saved" after dropping
 * part of what was typed is a failure nobody sees. Blank handles are
 * ignored, since that same older form sends them for every field left empty.
 *
 * @param userId - Id of the authenticated caller.
 * @param input - New profile values; an empty defaultCurrency leaves the currency unchanged.
 * @returns The refreshed user in proto shape.
 * @throws UsecaseError "invalid_argument" when the trimmed name is empty;
 *   "failed_precondition" when the request carries a non-blank payment handle.
 */
export async function updateProfile(
  userId: string,
  input: {
    name: string;
    defaultCurrency: string;
    paymentHandles?: { method: string; handle: string }[];
  },
) {
  const name = requireName(input.name);
  const defaultCurrency = input.defaultCurrency
    ? normalizeCurrencyCode(input.defaultCurrency)
    : undefined;
  if (input.paymentHandles?.some((entry) => entry.handle.trim() !== "")) {
    throw new UsecaseError("failed_precondition", PAYMENT_HANDLES_RETIRED_MESSAGE);
  }
  await updateUserProfile(userId, { name, defaultCurrency });
  return getMe(userId);
}

/**
 * Resolves a raw session token to the user it belongs to, for server
 * components that guard routes.
 *
 * Unlike bare {@link verifyToken}, this checks the embedded token_version
 * against the row and rejects suspended accounts — so a signed-out-everywhere
 * cookie stops rendering the app shell before every RPC inside it fails.
 *
 * @param token - Raw session token from the cookie.
 * @returns The user in proto shape, or null when the token is not usable.
 */
export async function sessionUser(token: string) {
  const userId = verifyToken(token);
  if (!userId) return null;
  const user = await findUserById(userId);
  if (!user || user.suspended_at) return null;
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
 * Detaches the caller's phone number — the release valve for a number that
 * was lost or recycled, without which it could only ever leave the account
 * by somebody else claiming it.
 *
 * Refused when the phone is the row's only identifier: the database's
 * chk_users_has_identifier says every live account stays reachable by
 * something, and this check turns that constraint into a sentence instead
 * of an internal error.
 *
 * @param userId - Id of the authenticated caller.
 * @returns The refreshed user in proto shape; a no-op when no phone is set.
 * @throws UsecaseError "invalid_argument" when the phone is the only identifier.
 */
export async function removePhone(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw new UsecaseError("unauthenticated", "account no longer exists");
  if (user.phone === null) return toPrivateUser(user);
  if (user.email === null) {
    invalid(
      "this number is the only way your account can be found — sign in with Google or Apple to attach an email before removing it",
    );
  }
  await setUserPhone(userId, null);
  return getMe(userId);
}

