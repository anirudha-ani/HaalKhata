/** All SQL for the users table: insert, lookups, profile updates. */

import type { PoolClient } from "pg";
import { execute, newId, query, queryOne } from "@/server/common/db/db";

/** One row of the users table. Field names mirror the SQL column names. */
export interface UserRow {
  id: string;
  /** Email address; null for a phone-only account. */
  email: string | null;
  name: string;
  /** Hex color (e.g. "#c73e2e") used as the user's avatar background. */
  avatar_color: string;
  /** Google profile picture URL; null when the person has none. */
  avatar_url: string | null;
  /** ISO 4217 code preselected as the currency for the user's new expenses. */
  default_currency: string;
  /** scrypt "salt:hash" string for a development password account; null otherwise. */
  password_hash: string | null;
  /** Phone number in E.164 (e.g. "+14155552671"); null when the user has no phone. */
  phone: string | null;
  /**
   * When the number last passed SMS possession (§35); null means never — a
   * dev password-signup number, or a number that predates verification. The chk_users_phone_verified_has_phone
   * constraint keeps it null whenever phone is.
   */
  phone_verified_at: string | null;
  /** Google account id (the ID token's `sub`); null when never signed in with Google. */
  google_sub: string | null;
  /** Apple account identifier; absent only in legacy test fixtures. */
  apple_sub?: string | null;
  /** Only fresh anonymous ledger records carry this erasure marker. */
  deleted_at?: string | null;
  /** Moderator suspension prevents all authenticated requests, including fresh tokens. */
  suspended_at?: string | null;
  /** When the first-run flow finished; null means the app still redirects there. */
  onboarded_at: string | null;
  /**
   * Whether people holding this account's verified number or email can find
   * it from their contacts: null = never answered (findable, the default),
   * true/false = the person's answer. Absent only in legacy test fixtures.
   */
  contact_discovery?: boolean | null;
  /** Monotonic counter baked into issued tokens; bumping it invalidates outstanding tokens. */
  token_version: number;
  created_at: string;
}

/**
 * Inserts a new users row with a freshly generated id.
 *
 * @param input - Column values for the new user; defaultCurrency falls back to "USD"
 *   and phone is optional. At least one of passwordHash, googleSub and appleSub
 *   must be set: chk_users_can_sign_in refuses a row nobody can sign in to.
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
  appleSub?: string | null;
  avatarUrl?: string | null;
}, client?: PoolClient): Promise<UserRow> {
  const rows = await query<UserRow>(
    `INSERT INTO users (id, email, name, avatar_color, default_currency, password_hash, phone, google_sub, apple_sub, avatar_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      input.appleSub ?? null,
      input.avatarUrl ?? null,
    ],
    client,
  );
  return rows[0];
}

/**
 * Updates the stored Google profile picture URL.
 *
 * Called whenever a sign-in reports a URL different from the stored one, so a
 * changed Google photo follows the person here instead of leaving a link that
 * quietly 404s.
 *
 * @param userId - Account to update.
 * @param avatarUrl - New picture URL.
 */
export async function setAvatarUrl(userId: string, avatarUrl: string): Promise<void> {
  await execute(`UPDATE users SET avatar_url = $1 WHERE id = $2`, [avatarUrl, userId]);
}

/**
 * Looks a user up by primary key.
 *
 * @param userId - Primary key of the user to fetch.
 * @param client - Transaction client, so a read inside a write stays on its connection.
 * @returns The matching row, or undefined when no such user exists.
 */
export async function findUserById(userId: string, client?: PoolClient): Promise<UserRow | undefined> {
  return queryOne<UserRow>(`SELECT usr.* FROM users usr WHERE usr.id = $1 AND usr.deleted_at IS NULL`, [userId], client);
}

/**
 * Looks a user up by email address, case-insensitively.
 *
 * @param email - Email address to match, in any casing.
 * @returns The matching row, or undefined when no such user exists.
 */
export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>(
    `SELECT usr.* FROM users usr
      WHERE lower(usr.email) = lower($1) AND usr.deleted_at IS NULL`,
    [email],
  );
}

/**
 * Looks a user up by phone number (E.164, exact match).
 *
 * @param phone - Phone number in E.164 form (e.g. "+14155552671").
 * @returns The matching row, or undefined when no such user exists.
 */
export async function findUserByPhone(phone: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>(
    `SELECT usr.* FROM users usr WHERE usr.phone = $1 AND usr.deleted_at IS NULL`,
    [phone],
  );
}

/**
 * Looks a user up by their Google account id (the ID token's `sub` claim).
 *
 * @param googleSub - Google's stable per-account identifier.
 * @returns The matching row, or undefined when no row is linked to that account.
 */
export async function findUserByGoogleSub(googleSub: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>(
    `SELECT usr.* FROM users usr WHERE usr.google_sub = $1 AND usr.deleted_at IS NULL`,
    [googleSub],
  );
}

/**
 * Links a Google account to an existing account, keeping the name its owner
 * chose.
 *
 * @param userId - Primary key of the account to link.
 * @param googleSub - Google's stable per-account identifier.
 */
export async function linkGoogleAccount(userId: string, googleSub: string): Promise<void> {
  await execute(`UPDATE users SET google_sub = $1 WHERE id = $2`, [googleSub, userId]);
}

/**
 * Fetches every user whose id appears in the given list.
 *
 * @param userIds - Primary keys of the users to fetch.
 * @param client - Transaction client, so a read inside a write stays on its connection.
 * @returns The matching rows in no guaranteed order; unknown ids are silently skipped.
 */
export async function findUsersByIds(userIds: string[], client?: PoolClient): Promise<UserRow[]> {
  if (userIds.length === 0) return [];
  return query<UserRow>(`SELECT usr.* FROM users usr WHERE usr.id = ANY($1::text[])`, [userIds], client);
}

/**
 * Writes a just-verified phone number onto an account, stamping
 * `phone_verified_at` with it (§35). Every caller sits directly behind an
 * approved SMS code check — the plain claim, the §34 transfer, the removal
 * flow's clear — so the stamp lives here rather than being a flag each call
 * site could forget. The one unverified write (dev signup) goes through
 * insertUser and never touches this.
 *
 * Callers must have already resolved any collision: `users.phone` carries a
 * partial unique index, so a number still held by another row is rejected by
 * Postgres rather than silently overwritten.
 *
 * @param userId - Account to write to.
 * @param phone - E.164 number, or null to clear it (which clears the stamp).
 */
export async function setUserPhone(
  userId: string,
  phone: string | null,
  client?: PoolClient,
): Promise<void> {
  await execute(
    `UPDATE users
        SET phone = $1,
            phone_verified_at = CASE WHEN $1::text IS NULL THEN NULL ELSE now() END
      WHERE id = $2`,
    [phone, userId],
    client,
  );
}

/**
 * Stamps the first-run flow as finished, including when it was skipped.
 *
 * Idempotent: the first stamp wins, so a double submit does not move the date.
 *
 * @param userId - Account that completed onboarding.
 */
export async function markOnboarded(userId: string): Promise<void> {
  await execute(`UPDATE users SET onboarded_at = now() WHERE id = $1 AND onboarded_at IS NULL`, [
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
    `SELECT token_version FROM users WHERE id = $1 AND suspended_at IS NULL`,
    [userId],
  );
  return versionRow?.token_version;
}

/**
 * Increments the user's token_version, invalidating every bearer token issued
 * before this point (the current sign-out-everywhere behavior).
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
 * @param client - Transaction client when the profile and related rows must update atomically.
 */
export async function updateUserProfile(
  userId: string,
  fields: { name?: string; defaultCurrency?: string },
  client?: PoolClient,
): Promise<void> {
  await execute(
    `UPDATE users
        SET name = COALESCE($2, name),
            default_currency = COALESCE($3, default_currency)
      WHERE id = $1`,
    [userId, fields.name ?? null, fields.defaultCurrency ?? null],
    client,
  );
}

/**
 * Records the person's answer to "let people find me from their contacts".
 *
 * @param userId - Account the answer belongs to.
 * @param discoverable - True to be findable, false to stay hidden.
 */
export async function setContactDiscovery(userId: string, discoverable: boolean): Promise<void> {
  await execute(`UPDATE users SET contact_discovery = $2 WHERE id = $1`, [userId, discoverable]);
}
