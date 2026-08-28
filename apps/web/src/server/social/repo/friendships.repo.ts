/** All SQL for accepted friendships and directed pending friend requests. */

import type { PoolClient } from "pg";
import { execute, query, queryOne, transaction } from "@/server/common/db";
import { MAX_PENDING_FRIEND_REQUESTS } from "@/server/social/social.constants";

/**
 * Serializes pending-request and friendship changes for a deterministic set
 * of inboxes, preventing accept/send races from recreating stale requests.
 *
 * @param userIds - Inbox owner ids to lock in any order.
 * @param client - Transaction client that owns the advisory locks.
 */
async function lockFriendRequestInboxes(
  userIds: string[],
  client: PoolClient,
): Promise<void> {
  for (const userId of [...new Set(userIds)].sort()) {
    await execute(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`friend-request-inbox:${userId}`],
      client,
    );
  }
}

/**
 * Records a friendship as two symmetric rows (user→friend and friend→user);
 * a no-op for pairs that are already friends.
 *
 * @param userId - Id of one side of the friendship.
 * @param friendId - Id of the other side of the friendship.
 * @param client - Existing transaction client when acceptance must be atomic.
 */
export async function insertFriendship(
  userId: string,
  friendId: string,
  client?: PoolClient,
): Promise<void> {
  const persist = async (transactionClient: PoolClient): Promise<void> => {
    await lockFriendRequestInboxes([userId, friendId], transactionClient);
    await execute(
      `DELETE FROM friend_requests
        WHERE (requester_id = $1 AND recipient_id = $2)
           OR (requester_id = $2 AND recipient_id = $1)`,
      [userId, friendId],
      transactionClient,
    );
    await execute(
      `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)
       ON CONFLICT DO NOTHING`,
      [userId, friendId],
      transactionClient,
    );
  };
  if (client) await persist(client);
  else await transaction(persist);
}

/**
 * Lists the ids of everyone the given user has an explicit friendship with.
 *
 * @param userId - Id of the user whose friends to look up.
 * @returns The friend user ids (unordered).
 */
export async function listFriendIds(userId: string): Promise<string[]> {
  const friendshipRows = await query<{ friend_id: string }>(
    `SELECT friend_id FROM friendships WHERE user_id = $1`,
    [userId],
  );
  return friendshipRows.map((friendshipRow) => friendshipRow.friend_id);
}

/**
 * Checks one accepted friendship without loading the caller's full list.
 *
 * @param userId - Account on one side of the relationship.
 * @param friendId - Candidate accepted friend.
 * @returns True when the directed friendship row exists.
 */
export async function friendshipExists(userId: string, friendId: string): Promise<boolean> {
  return (
    (await queryOne<{ matched: number }>(
      `SELECT 1 AS matched FROM friendships
        WHERE user_id = $1 AND friend_id = $2`,
      [userId, friendId],
    )) !== undefined
  );
}

/**
 * Inserts one directed pending request without refreshing or duplicating it.
 *
 * @param requesterId - Account asking to connect.
 * @param recipientId - Account that must accept or decline.
 * @param client - Existing transaction client when related writes must be atomic.
 * @returns True only when this call created a new pending request.
 */
export async function insertFriendRequest(
  requesterId: string,
  recipientId: string,
  client?: PoolClient,
): Promise<boolean> {
  const persist = async (transactionClient: PoolClient): Promise<boolean> => {
    // Serialize capacity checks for one recipient. Without this lock, many
    // distinct senders can all observe 99 rows and exceed the hard inbox cap.
    await lockFriendRequestInboxes([recipientId], transactionClient);
    const inserted = await queryOne<{ requester_id: string }>(
      `INSERT INTO friend_requests (requester_id, recipient_id)
       SELECT $1, $2
        WHERE NOT EXISTS (
                SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2
              )
          AND (SELECT COUNT(*) FROM friend_requests WHERE recipient_id = $2) < $3
       ON CONFLICT DO NOTHING
       RETURNING requester_id`,
      [requesterId, recipientId, MAX_PENDING_FRIEND_REQUESTS],
      transactionClient,
    );
    return inserted !== undefined;
  };
  return client ? persist(client) : transaction(persist);
}

/**
 * Lists pending request senders for one recipient, oldest first.
 *
 * @param recipientId - Account viewing its incoming requests.
 * @returns Requester ids in stable creation order.
 */
export async function listIncomingFriendRequestIds(recipientId: string): Promise<string[]> {
  const requestRows = await query<{ requester_id: string }>(
    `SELECT requester_id FROM friend_requests
      WHERE recipient_id = $1
      ORDER BY created_at, requester_id
      LIMIT $2`,
    [recipientId, MAX_PENDING_FRIEND_REQUESTS],
  );
  return requestRows.map((requestRow) => requestRow.requester_id);
}

/**
 * Atomically consumes one incoming request while a response transaction runs.
 *
 * @param requesterId - Account that sent the request.
 * @param recipientId - Authenticated account responding to it.
 * @param client - Transaction client shared with friendship insertion.
 * @returns True when a matching pending request existed and was removed.
 */
export async function deleteFriendRequest(
  requesterId: string,
  recipientId: string,
  client: PoolClient,
): Promise<boolean> {
  await lockFriendRequestInboxes([requesterId, recipientId], client);
  const removed = await queryOne<{ requester_id: string }>(
    `DELETE FROM friend_requests
      WHERE requester_id = $1 AND recipient_id = $2
      RETURNING requester_id`,
    [requesterId, recipientId],
    client,
  );
  return removed !== undefined;
}
