/** All SQL for the notifications table. */

import { execute, newId, query, queryOne, transaction } from "@/server/common/db";

/** A row from the notifications table (column names mirror SQL). */
export interface NotificationRow {
  id: string;
  /** Id of the user this notification belongs to. */
  user_id: string;
  /** Notification kind, e.g. "added_to_group". */
  type: string;
  title: string;
  body: string;
  /** In-app path the notification links to. */
  link: string;
  /** When the user read it; null while still unread. */
  read_at: string | null;
  created_at: string;
}

/**
 * Inserts the same notification for each recipient, atomically; a no-op when
 * the recipient list is empty.
 *
 * @param userIds - Ids of the users to notify (one row per user).
 * @param input - Notification content: kind, title, body text, and the
 *   in-app link it points to.
 */
export async function insertNotifications(
  userIds: string[],
  input: { type: string; title: string; body: string; link: string },
): Promise<void> {
  if (userIds.length === 0) return;
  await transaction(async (client) => {
    for (const userId of userIds) {
      await client.query(
        `INSERT INTO notifications (id, user_id, type, title, body, link)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newId(), userId, input.type, input.title, input.body, input.link],
      );
    }
  });
}

/**
 * Lists a user's newest notifications.
 *
 * @param userId - Id of the user whose notifications to fetch.
 * @param limit - Maximum number of notifications to return (newest first).
 * @returns Notification rows ordered by creation time descending.
 */
export async function listNotificationsByUser(
  userId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  return query<NotificationRow>(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
}

/**
 * When the newest notification of a given type was sent to a user with a
 * given link. Used to enforce the reminder cooldown without a second table:
 * the reminder itself is the record that it happened.
 *
 * @param userId - Recipient of the notification.
 * @param type - Notification kind, e.g. "reminder".
 * @param link - The in-app link the notification points at, which identifies
 *   the sender for a reminder.
 * @returns The newest matching created_at, or undefined when there is none.
 */
export async function findLatestNotificationAt(
  userId: string,
  type: string,
  link: string,
): Promise<string | undefined> {
  const latest = await queryOne<{ created_at: string }>(
    `SELECT created_at FROM notifications
     WHERE user_id = $1 AND type = $2 AND link = $3
     ORDER BY created_at DESC LIMIT 1`,
    [userId, type, link],
  );
  return latest?.created_at;
}

/**
 * Counts a user's unread notifications.
 *
 * @param userId - Id of the user whose unread notifications to count.
 * @returns The number of notifications with no read_at timestamp.
 */
export async function countUnread(userId: string): Promise<number> {
  const countRow = await queryOne<{ unread_count: number }>(
    `SELECT COUNT(*)::int AS unread_count
     FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return countRow?.unread_count ?? 0;
}

/**
 * Marks all of a user's unread notifications as read (stamps read_at now).
 *
 * @param userId - Id of the user whose notifications to mark read.
 */
export async function markAllRead(userId: string): Promise<void> {
  await execute(
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
}
