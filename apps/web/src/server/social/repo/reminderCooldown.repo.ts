/** Durable reminder eligibility, independent from deletable notification presentation. */

import type { PoolClient } from "pg";
import { execute, queryOne } from "@/server/common/db/db";

/**
 * Reads the most recent reminder between two people.
 * @param senderId - Person requesting payment.
 * @param recipientId - Person being reminded.
 * @param client - Existing reminder transaction, when checking under its lock.
 * @returns Last reminder time, or undefined when none has been sent.
 */
export async function findReminderSentAt(senderId: string, recipientId: string, client?: PoolClient): Promise<string | undefined> {
  const reminder = await queryOne<{ last_sent_at: string }>(
    "SELECT last_sent_at FROM reminder_cooldowns WHERE sender_id = $1 AND recipient_id = $2",
    [senderId, recipientId],
    client,
  );
  return reminder?.last_sent_at;
}

/**
 * Records eligibility consumption on the same transaction as its notification.
 * @param senderId - Person requesting payment.
 * @param recipientId - Person being reminded.
 * @param client - Transaction holding this pair's reminder lock.
 */
export async function recordReminderSent(senderId: string, recipientId: string, client: PoolClient): Promise<void> {
  await execute(
    `INSERT INTO reminder_cooldowns(sender_id, recipient_id, last_sent_at)
     VALUES ($1, $2, clock_timestamp())
     ON CONFLICT (sender_id, recipient_id) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at`,
    [senderId, recipientId],
    client,
  );
}
