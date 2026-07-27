/** All SQL for the users table: insert, lookups, shadow-user claim, profile updates. */

import { execute, newId, query, queryOne } from "@/server/common/db";

/** One row of the users table. Field names mirror the SQL column names. */
export interface UserRow {
  id: string;
  /** Email address; null for a phone-only account. */
  email: string | null;
  name: string;
  /** Hex color (e.g. "#c73e2e") used as the user's avatar background. */
  avatar_color: string;
  /** ISO 4217 code preselected as the currency for the user's new expenses. */
  default_currency: string;
  /** scrypt "salt:hash" string; null marks a shadow user who has not registered yet. */
  password_hash: string | null;
  /** Phone number in E.164 (e.g. "+14155552671"); null when the user has no phone. */
  phone: string | null;
  /** Google account id (the ID token's `sub`); null when never signed in with Google. */
  google_sub: string | null;
  /** Monotonic counter baked into issued tokens; bumping it invalidates outstanding tokens. */
  token_version: number;
  created_at: string;
  /** Where this person wants to be paid; empty array when they have set none. */
  payment_handles: { method: string; handle: string }[];
}

/**
 * Every users column plus the user's payment handles as a JSON array.
 *
 * Folded into the lookups themselves so a User is never handed out without
 * them: the settle modal is reached from four different screens, each with a
 * different source for the recipient, and threading a separate handle fetch
 * through all four would guarantee one of them silently lacks it.
 */
const USER_COLUMNS = `usr.*, COALESCE((
  SELECT json_agg(json_build_object('method', handles.method, 'handle', handles.handle)
                  ORDER BY handles.method)
  FROM payment_handles handles WHERE handles.user_id = usr.id
), '[]'::json) AS payment_handles`;

/**
 * Inserts a new users row with a freshly generated id.
 *
 * @param input - Column values for the new user; defaultCurrency falls back to "USD",
 *   a null passwordHash creates a claimable shadow user, and phone is optional.
 * @returns The inserted row.
 */
export async function insertUser(input: {
  email: string | null;
  name: string;
  avatarColor: string;
  passwordHash: string | null;
  defaultCurrency?: string;
  phone?: string | null;
  googleSub?: string | null;
}): Promise<UserRow> {
  const rows = await query<UserRow>(
    `INSERT INTO users (id, email, name, avatar_color, default_currency, password_hash, phone, google_sub)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      newId(),
      input.email,
      input.name,
      input.avatarColor,
      input.defaultCurrency ?? "USD",
      input.passwordHash,
      input.phone ?? null,
      input.googleSub ?? null,
    ],
  );
  return rows[0];
}

/**
 * Looks a user up by primary key.
 *
 * @param userId - Primary key of the user to fetch.
 * @returns The matching row, or undefined when no such user exists.
 */
export async function findUserById(userId: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users usr WHERE usr.id = $1`, [userId]);
}

/**
 * Looks a user up by email address, case-insensitively.
 *
 * @param email - Email address to match, in any casing.
 * @returns The matching row, or undefined when no such user exists.
 */
export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users usr WHERE lower(usr.email) = lower($1)`, [
    email,
  ]);
}

/**
 * Looks a user up by phone number (E.164, exact match).
 *
 * @param phone - Phone number in E.164 form (e.g. "+14155552671").
 * @returns The matching row, or undefined when no such user exists.
 */
export async function findUserByPhone(phone: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users usr WHERE usr.phone = $1`, [phone]);
}

/**
 * Looks a user up by their Google account id (the ID token's `sub` claim).
 *
 * @param googleSub - Google's stable per-account identifier.
 * @returns The matching row, or undefined when no row is linked to that account.
 */
export async function findUserByGoogleSub(googleSub: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users usr WHERE usr.google_sub = $1`, [
    googleSub,
  ]);
}

/**
 * Links a Google account to an existing row, optionally replacing a
 * placeholder display name.
 *
 * An invitee who was never given a name got one derived from their email's
 * local part, which Google can improve on; a name the person chose themselves
 * must survive untouched. Passing an empty `name` leaves the column alone.
 *
 * @param userId - Primary key of the row to link.
 * @param googleSub - Google's stable per-account identifier.
 * @param name - Replacement display name, or "" to keep the existing one.
 */
export async function linkGoogleAccount(
  userId: string,
  googleSub: string,
  name: string,
): Promise<void> {
  await execute(
    `UPDATE users SET google_sub = $1, name = COALESCE(NULLIF($2, ''), name) WHERE id = $3`,
    [googleSub, name, userId],
  );
}

/**
 * Fetches every user whose id appears in the given list.
 *
 * @param userIds - Primary keys of the users to fetch.
 * @returns The matching rows in no guaranteed order; unknown ids are silently skipped.
 */
export async function findUsersByIds(userIds: string[]): Promise<UserRow[]> {
  if (userIds.length === 0) return [];
  return query<UserRow>(`SELECT ${USER_COLUMNS} FROM users usr WHERE usr.id = ANY($1::text[])`, [
    userIds,
  ]);
}

/**
 * A shadow user registers: sets name + password on the existing row.
 *
 * @param userId - Primary key of the shadow user's existing row.
 * @param name - Display name chosen at registration.
 * @param passwordHash - scrypt "salt:hash" string for the newly chosen password.
 */
export async function claimUser(
  userId: string,
  name: string,
  passwordHash: string,
): Promise<void> {
  await execute(`UPDATE users SET name = $1, password_hash = $2 WHERE id = $3`, [
    name,
    passwordHash,
    userId,
  ]);
}

/**
 * Fetches only the current token_version for a user (cheap read used on every
 * authenticated request to validate the bearer token's embedded version).
 *
 * @param userId - Primary key of the user to check.
 * @returns The current token_version, or undefined when the user does not exist.
 */
export async function findUserTokenVersion(userId: string): Promise<number | undefined> {
  const versionRow = await queryOne<{ token_version: number }>(
    `SELECT token_version FROM users WHERE id = $1`,
    [userId],
  );
  return versionRow?.token_version;
}

/**
 * Increments the user's token_version, invalidating every bearer token issued
 * before this point (logout everywhere / password change).
 *
 * @param userId - Primary key of the user whose tokens are being revoked.
 */
export async function bumpTokenVersion(userId: string): Promise<void> {
  await execute(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [userId]);
}

/**
 * Updates only the profile columns present in fields, leaving the rest untouched.
 *
 * @param userId - Primary key of the user to update.
 * @param fields - New values; only properties that are defined get written.
 */
export async function updateUserProfile(
  userId: string,
  fields: { name?: string; defaultCurrency?: string },
): Promise<void> {
  if (fields.name !== undefined) {
    await execute(`UPDATE users SET name = $1 WHERE id = $2`, [fields.name, userId]);
  }
  if (fields.defaultCurrency !== undefined) {
    await execute(`UPDATE users SET default_currency = $1 WHERE id = $2`, [
      fields.defaultCurrency,
      userId,
    ]);
  }
}
