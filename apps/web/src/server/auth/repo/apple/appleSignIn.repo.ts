/** SQL for one-use Apple challenges, provider identity and encrypted revocation credentials. */

import type { PoolClient } from "pg";
import { execute, query, queryOne } from "@/server/common/db/db";
import type { UserRow } from "../users.repo";

/** Stored challenge; all bearer-capable values are hashed. */
export interface AppleChallengeRow {
  state_hash: string; nonce_hash: string; client_id: string;
  verifier_hash: string | null; mobile: boolean; user_id: string | null;
}

/**
 * Stores a short-lived challenge and prunes expired attempts.
 * @param challenge Hashed challenge and target client.
 * @param lifetimeSeconds Challenge TTL.
 */
export async function insertAppleChallenge(challenge: AppleChallengeRow, lifetimeSeconds: number): Promise<void> {
  await execute("DELETE FROM apple_sign_in_challenges WHERE expires_at <= NOW()", []);
  await execute(`INSERT INTO apple_sign_in_challenges
    (state_hash, nonce_hash, client_id, verifier_hash, mobile, expires_at)
    VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(secs => $6))`,
  [challenge.state_hash, challenge.nonce_hash, challenge.client_id, challenge.verifier_hash, challenge.mobile, lifetimeSeconds]);
}

/**
 * Finds an uncompleted browser challenge by its state hash.
 * @param stateHash SHA-256 callback state.
 * @returns A live browser challenge or undefined.
 */
export async function findAppleBrowserChallenge(stateHash: string) {
  return queryOne<AppleChallengeRow>(`SELECT * FROM apple_sign_in_challenges
    WHERE state_hash = $1 AND verifier_hash IS NOT NULL AND user_id IS NULL AND expires_at > NOW()`, [stateHash]);
}

/**
 * Atomically consumes a native nonce before binding its verified identity.
 * @param nonceHash SHA-256 token nonce.
 * @param client Transaction owning the sign-in.
 * @returns A matching live native challenge once only.
 */
export async function consumeAppleNativeChallenge(nonceHash: string, client: PoolClient) {
  return queryOne<AppleChallengeRow>(`DELETE FROM apple_sign_in_challenges
    WHERE nonce_hash = $1 AND verifier_hash IS NULL AND expires_at > NOW() RETURNING *`, [nonceHash], client);
}

/**
 * Attaches a verified browser identity without exposing its session in a redirect.
 * @param stateHash Callback state.
 * @param userId Verified local account.
 * @param client Sign-in transaction.
 * @returns True for the first completion of a live challenge.
 */
export async function finishAppleBrowserChallenge(stateHash: string, userId: string, client: PoolClient) {
  const result = await queryOne<AppleChallengeRow>(`UPDATE apple_sign_in_challenges SET user_id = $2
    WHERE state_hash = $1 AND user_id IS NULL AND expires_at > NOW() RETURNING *`, [stateHash, userId], client);
  return Boolean(result);
}

/**
 * Redeems a completed browser attempt only for the client holding its secret verifier.
 * @param stateHash Callback state hash.
 * @param verifierHash Client proof hash.
 * @returns Verified account id, once only.
 */
export async function consumeAppleBrowserChallenge(stateHash: string, verifierHash: string) {
  return queryOne<{ user_id: string }>(`DELETE FROM apple_sign_in_challenges
    WHERE state_hash = $1 AND verifier_hash = $2 AND user_id IS NOT NULL AND expires_at > NOW()
    RETURNING user_id`, [stateHash, verifierHash]);
}

/**
 * Serializes Apple identities and verified-mailbox account linking.
 * @param email Verified mailbox, normalized by the usecase.
 * @param client Current transaction.
 */
export async function lockAppleIdentity(email: string, client: PoolClient): Promise<void> {
  await query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`apple-email:${email}`], client);
}

/**
 * Finds the linked Apple account, falling back to its verified mailbox.
 * @param subject Verified Apple subject.
 * @param email Verified mailbox.
 * @param client Current transaction.
 * @returns Matching active account, with provider identity taking precedence.
 */
export async function findAppleUser(subject: string, email: string, client: PoolClient) {
  return queryOne<UserRow>(`SELECT * FROM users WHERE merged_into IS NULL AND deleted_at IS NULL AND (apple_sub = $1 OR lower(email) = $2)
    ORDER BY (apple_sub = $1) DESC NULLS LAST LIMIT 1 FOR UPDATE`, [subject, email], client);
}

/**
 * Links a verified Apple identity and stores encrypted authorization credentials.
 * @param userId Local account.
 * @param subject Verified Apple subject.
 * @param name Optional replacement for a shadow display name.
 * @param clientId Original OAuth audience.
 * @param ciphertext Encrypted refresh token.
 * @param client Current transaction.
 */
export async function saveAppleIdentity(userId: string, subject: string, name: string,
  clientId: string, ciphertext: string, client: PoolClient): Promise<void> {
  await execute("UPDATE users SET apple_sub = $2, name = COALESCE(NULLIF($3, ''), name) WHERE id = $1",
    [userId, subject, name], client);
  await execute(`INSERT INTO apple_credentials (user_id, client_id, refresh_token_ciphertext) VALUES ($1, $2, $3)
    ON CONFLICT (user_id, client_id) DO UPDATE SET refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext`,
  [userId, clientId, ciphertext], client);
}

/**
 * Reads every provider grant that must be revoked when deleting an account.
 * @param userId Account being erased.
 * @returns Original clients and encrypted revocation credentials.
 */
export async function listAppleCredentials(userId: string, client?: PoolClient) {
  return query<{ client_id: string; refresh_token_ciphertext: string }>(
    "SELECT client_id, refresh_token_ciphertext FROM apple_credentials WHERE user_id = $1", [userId], client);
}
