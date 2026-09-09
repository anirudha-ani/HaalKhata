/** All SQL for accepted friendships and directed pending friend requests. */

import type { PoolClient } from "pg";
import { execute, query, queryOne, transaction } from "@/server/common/db";
import { lockFriendRequestInboxes } from "@/server/common/ledgerLocks";
import { MAX_PENDING_FRIEND_REQUESTS } from "@/server/social/social.constants";

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
    await lockFriendRequestInboxes(transactionClient, [userId, friendId]);
    await execute(
      `DELETE FROM friend_requests
        WHERE (requester_id = $1 AND recipient_id = $2)
           OR (requester_id = $2 AND recipient_id = $1)`,
      [userId, friendId],
      transactionClient,
    );
    await execute(
      `INSERT INTO friendships (user_id, friend_id)
       SELECT pair.user_id, pair.friend_id
         FROM (VALUES ($1::text, $2::text), ($2::text, $1::text)) AS pair(user_id, friend_id)
        WHERE $1 <> $2
          AND EXISTS (
                SELECT 1 FROM users usr WHERE usr.id = $1 AND usr.merged_into IS NULL
              )
          AND EXISTS (
                SELECT 1 FROM users usr WHERE usr.id = $2 AND usr.merged_into IS NULL
              )
       ON CONFLICT DO NOTHING`,
      [userId, friendId],
      transactionClient,
    );
  };
  if (client) await persist(client);
  else await transaction(persist);
}

/**
 * Removes a friendship in both stored directions, along with any pending
 * requests between the pair. Lock-free on purpose: the usecase holds the
 * pair's inbox locks (the order every friendship writer takes), so a
 * concurrent accept or send serializes instead of racing the deletes.
 *
 * @param userId - One side of the friendship.
 * @param friendId - The other side.
 * @param client - The removal's transaction client.
 */
export async function deleteFriendship(
  userId: string,
  friendId: string,
  client: PoolClient,
): Promise<void> {
  await execute(
    `DELETE FROM friendships
      WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [userId, friendId],
    client,
  );
  await execute(
    `DELETE FROM friend_requests
      WHERE (requester_id = $1 AND recipient_id = $2)
         OR (requester_id = $2 AND recipient_id = $1)`,
    [userId, friendId],
    client,
  );
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
 * @param recipientIdentifier - The email or phone the requester typed, kept
 *   so their sent-requests list can echo it back; omitted when the recipient
 *   was chosen by id or reached through a link.
 * @returns True only when this call created a new pending request.
 */
export async function insertFriendRequest(
  requesterId: string,
  recipientId: string,
  client?: PoolClient,
  recipientIdentifier?: string,
): Promise<boolean> {
  const persist = async (transactionClient: PoolClient): Promise<boolean> => {
    // Serialize capacity checks for one recipient and account merges for both
    // identities. Without the recipient lock, many distinct senders can all
    // observe 99 rows and exceed the cap; without the requester lock, merging
    // that account can race this insert and leave a request on its tombstone.
    await lockFriendRequestInboxes(transactionClient, [requesterId, recipientId]);
    const inserted = await queryOne<{ requester_id: string }>(
      `INSERT INTO friend_requests (requester_id, recipient_id, recipient_identifier)
       SELECT $1, $2, $4::text
        WHERE $1 <> $2
          AND EXISTS (
                SELECT 1 FROM users usr WHERE usr.id = $1 AND usr.merged_into IS NULL
              )
          AND EXISTS (
                SELECT 1 FROM users usr WHERE usr.id = $2 AND usr.merged_into IS NULL
              )
          AND NOT EXISTS (
                SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2
              )
          AND (SELECT COUNT(*) FROM friend_requests WHERE recipient_id = $2) < $3
       ON CONFLICT DO NOTHING
       RETURNING requester_id`,
      [requesterId, recipientId, MAX_PENDING_FRIEND_REQUESTS, recipientIdentifier ?? null],
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

/** A pending request as its sender sees it (column names mirror SQL). */
export interface OutgoingFriendRequestRow {
  recipient_id: string;
  /** What the requester typed to reach them; null when chosen by id or through a link. */
  recipient_identifier: string | null;
  created_at: string;
}

/**
 * Lists the requests one account has sent that are still unanswered, oldest first.
 *
 * @param requesterId - Account viewing what it has sent.
 * @returns Recipient ids with the identifier typed for each, in creation order.
 */
export async function listOutgoingFriendRequests(
  requesterId: string,
): Promise<OutgoingFriendRequestRow[]> {
  return query<OutgoingFriendRequestRow>(
    `SELECT recipient_id, recipient_identifier, created_at
       FROM friend_requests
      WHERE requester_id = $1
      ORDER BY created_at, recipient_id
      LIMIT $2`,
    [requesterId, MAX_PENDING_FRIEND_REQUESTS],
  );
}

/**
 * Counts the unanswered requests addressed to one account, for a badge.
 * Senders merged away since requesting are skipped, matching what the
 * incoming list shows.
 *
 * @param recipientId - Account whose inbox to count.
 * @returns The number of pending requests the recipient can act on.
 */
export async function countIncomingFriendRequests(recipientId: string): Promise<number> {
  const countRow = await queryOne<{ pending_count: number }>(
    `SELECT COUNT(*)::int AS pending_count
       FROM friend_requests request
       JOIN users requester
         ON requester.id = request.requester_id AND requester.merged_into IS NULL
      WHERE request.recipient_id = $1`,
    [recipientId],
  );
  return countRow?.pending_count ?? 0;
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
  await lockFriendRequestInboxes(client, [requesterId, recipientId]);
  const removed = await queryOne<{ requester_id: string }>(
    `DELETE FROM friend_requests
      WHERE requester_id = $1 AND recipient_id = $2
      RETURNING requester_id`,
    [requesterId, recipientId],
    client,
  );
  return removed !== undefined;
}
