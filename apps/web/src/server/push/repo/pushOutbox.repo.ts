/** All SQL for push_outbox: committed bell rows waiting to be pushed. */

import type { PoolClient } from "pg";
import { execute, query } from "@/server/common/db/db";

/** One claimed outbox row, joined to the notification it pushes. */
export interface ClaimedPushRow {
  notification_id: string;
  /** The recipient. */
  user_id: string;
  /** Claims so far, this one included. */
  attempts: number;
  /** When the row was queued — the notification's commit. */
  queued_at: string;
  type: string;
  title: string;
  body: string;
  link: string;
  actor_id: string | null;
  /** The group of the expense the notification links to, when it links to one. */
  expense_group_id: string | null;
  /** Notifications from the same actor to the same recipient in the cap window, this one included. */
  recent_from_actor: number;
  /** Phones an earlier attempt already delivered this push to; a retry skips them. */
  delivered_device_ids: string[];
}

/** A row the dispatcher will try again later. */
export interface PushRetry {
  notificationId: string;
  delaySeconds: number;
  error: string;
  /** Phones this attempt delivered to, added to the row's list so the retry skips them. */
  deliveredDeviceIds: string[];
}

/**
 * Queues a push for each notification and wakes the dispatcher. Runs on the
 * notification's own transaction: the NOTIFY is delivered only when that
 * transaction commits and is dropped if it rolls back, so a push exists
 * exactly when the change it announces does.
 *
 * @param entries - Inserted notification ids with their recipients.
 * @param channel - NOTIFY channel the dispatcher listens on.
 * @param client - The notification's transaction.
 */
export async function enqueuePushes(
  entries: { notificationId: string; userId: string }[],
  channel: string,
  client: PoolClient,
): Promise<void> {
  if (entries.length === 0) return;
  await execute(
    `INSERT INTO push_outbox (notification_id, user_id)
     SELECT * FROM unnest($1::text[], $2::text[])`,
    [entries.map((entry) => entry.notificationId), entries.map((entry) => entry.userId)],
    client,
  );
  await execute(`SELECT pg_notify($1, '')`, [channel], client);
}

/**
 * Claims due rows for one dispatch pass. One statement: `SKIP LOCKED` keeps
 * two workers from taking the same row, and pushing next_attempt_at forward
 * is the lease — a worker that dies mid-send leaves its rows to be claimed
 * again once it lapses. No transaction stays open across the HTTP call.
 *
 * @param limit - Rows to claim at most.
 * @param leaseSeconds - How long the claim hides the rows.
 * @param pairWindowMinutes - Window for counting pushes from the same actor.
 * @returns The claimed rows with their notification's content.
 */
export async function claimDuePushes(
  limit: number,
  leaseSeconds: number,
  pairWindowMinutes: number,
): Promise<ClaimedPushRow[]> {
  return query<ClaimedPushRow>(
    `WITH due AS (
       SELECT notification_id FROM push_outbox
        WHERE next_attempt_at <= now()
        ORDER BY next_attempt_at, notification_id
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     ), claimed AS (
       UPDATE push_outbox outbox
          SET attempts = outbox.attempts + 1,
              next_attempt_at = now() + make_interval(secs => $2)
         FROM due
        WHERE outbox.notification_id = due.notification_id
       RETURNING outbox.notification_id, outbox.user_id, outbox.attempts, outbox.created_at,
                 outbox.delivered_device_ids
     )
     SELECT claimed.notification_id, claimed.user_id, claimed.attempts,
            claimed.created_at AS queued_at, claimed.delivered_device_ids,
            note.type, note.title, note.body, note.link, note.actor_id,
            expense.group_id AS expense_group_id,
            (SELECT count(*)::int FROM notifications earlier
              WHERE note.actor_id IS NOT NULL
                AND earlier.actor_id = note.actor_id AND earlier.user_id = note.user_id
                AND earlier.created_at > note.created_at - make_interval(mins => $3)
                AND earlier.created_at <= note.created_at) AS recent_from_actor
       FROM claimed
       JOIN notifications note ON note.id = claimed.notification_id
       -- Matched on expense.id itself, so the lookup uses the primary key
       -- ('/expenses/' is 10 characters); concatenating onto expense.id
       -- would scan every expense on each claim.
       LEFT JOIN expenses expense
              ON note.link LIKE '/expenses/%' AND expense.id = substr(note.link, 11)`,
    [limit, leaseSeconds, pairWindowMinutes],
  );
}

/**
 * Removes rows that were handed over, skipped or given up on.
 *
 * @param notificationIds - Rows to remove.
 */
export async function completePushes(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  await execute(`DELETE FROM push_outbox WHERE notification_id = ANY($1::text[])`, [notificationIds]);
}

/**
 * Schedules rows for another attempt, each after its own delay, adding the
 * phones this attempt reached to the row's delivered list so the retry
 * skips them.
 *
 * @param retries - Rows with their delay, the error that caused the retry
 *   and the phones already delivered to.
 */
export async function reschedulePushes(retries: PushRetry[]): Promise<void> {
  if (retries.length === 0) return;
  await execute(
    `UPDATE push_outbox outbox
        SET next_attempt_at = now() + make_interval(secs => entry.delay_seconds),
            last_error = entry.error,
            delivered_device_ids = ARRAY(
              SELECT DISTINCT unnest(outbox.delivered_device_ids || string_to_array(entry.delivered, ','))
            )
       FROM unnest($1::text[], $2::int[], $3::text[], $4::text[])
              AS entry(notification_id, delay_seconds, error, delivered)
      WHERE outbox.notification_id = entry.notification_id`,
    [
      retries.map((retry) => retry.notificationId),
      retries.map((retry) => retry.delaySeconds),
      retries.map((retry) => retry.error),
      // One text per row: a 2-D array would need every row's list the same
      // length. Device ids never hold a comma.
      retries.map((retry) => retry.deliveredDeviceIds.join(",")),
    ],
  );
}
