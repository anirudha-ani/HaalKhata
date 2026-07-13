/** All SQL for the friendships table (rows stored symmetrically). */

import { execute, query } from "@/server/common/db";

/**
 * Records a friendship as two symmetric rows (user→friend and friend→user);
 * a no-op for pairs that are already friends.
 *
 * @param userId - Id of one side of the friendship.
 * @param friendId - Id of the other side of the friendship.
 */
export async function insertFriendship(userId: string, friendId: string): Promise<void> {
  await execute(
    `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1)
     ON CONFLICT DO NOTHING`,
    [userId, friendId],
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
