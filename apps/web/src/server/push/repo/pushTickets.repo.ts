/** All SQL for push_tickets: accepted sends whose delivery receipt is still unread. */

import { execute, query } from "@/server/common/db/db";

/** A row from push_tickets (column names mirror SQL). */
export interface PushTicketRow {
  ticket_id: string;
  device_id: string;
  created_at: string;
}

/**
 * Records accepted sends so their receipts can be read later.
 *
 * @param tickets - Ticket ids from the delivery service with the device each was for.
 */
export async function insertPushTickets(tickets: { ticketId: string; deviceId: string }[]): Promise<void> {
  if (tickets.length === 0) return;
  await execute(
    `INSERT INTO push_tickets (ticket_id, device_id)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (ticket_id) DO NOTHING`,
    [tickets.map((ticket) => ticket.ticketId), tickets.map((ticket) => ticket.deviceId)],
  );
}

/**
 * Tickets old enough for their receipt to be ready, oldest first.
 *
 * @param minimumAgeMinutes - How long after a send a receipt is ready.
 * @param limit - Tickets to read at most.
 * @returns The tickets to look up.
 */
export async function listPushTicketsDue(minimumAgeMinutes: number, limit: number): Promise<PushTicketRow[]> {
  return query<PushTicketRow>(
    `SELECT * FROM push_tickets
      WHERE created_at <= now() - make_interval(mins => $1)
      ORDER BY created_at, ticket_id
      LIMIT $2`,
    [minimumAgeMinutes, limit],
  );
}

/**
 * Removes tickets whose receipt has been read.
 *
 * @param ticketIds - Tickets to remove.
 */
export async function deletePushTickets(ticketIds: string[]): Promise<void> {
  if (ticketIds.length === 0) return;
  await execute(`DELETE FROM push_tickets WHERE ticket_id = ANY($1::text[])`, [ticketIds]);
}

/**
 * Removes tickets the delivery service no longer keeps receipts for.
 *
 * @param hours - Age past which a receipt is gone.
 */
export async function deleteExpiredPushTickets(hours: number): Promise<void> {
  await execute(`DELETE FROM push_tickets WHERE created_at < now() - make_interval(hours => $1)`, [hours]);
}
