/** SQL persistence for short-lived, single-use Google authentication nonces. */

import { execute, queryOne } from "@/server/common/db";

/** Stored nonce row returned only while atomically consuming a challenge. */
interface GoogleSignInNonceRow {
  nonce_hash: string;
}

/**
 * Stores a hashed sign-in nonce after removing all expired challenges.
 *
 * @param nonceHash - SHA-256 digest of the nonce sent to the browser.
 * @param lifetimeSeconds - Number of seconds before the challenge expires.
 */
export async function insertGoogleSignInNonce(
  nonceHash: string,
  lifetimeSeconds: number,
): Promise<void> {
  await execute("DELETE FROM google_sign_in_nonces WHERE expires_at <= NOW()", []);
  await execute(
    `INSERT INTO google_sign_in_nonces (nonce_hash, expires_at)
     VALUES ($1, NOW() + make_interval(secs => $2))`,
    [nonceHash, lifetimeSeconds],
  );
}

/**
 * Atomically accepts and deletes one unexpired authentication nonce.
 *
 * @param nonceHash - SHA-256 digest of the nonce carried by Google's token.
 * @returns True only for the first use of a known, unexpired challenge.
 */
export async function consumeGoogleSignInNonce(nonceHash: string): Promise<boolean> {
  const consumed = await queryOne<GoogleSignInNonceRow>(
    `DELETE FROM google_sign_in_nonces
     WHERE nonce_hash = $1 AND expires_at > NOW()
     RETURNING nonce_hash`,
    [nonceHash],
  );
  return consumed !== undefined;
}
