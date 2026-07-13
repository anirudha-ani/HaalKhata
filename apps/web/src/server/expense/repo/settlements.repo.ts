/** All SQL for the settlements table. */

import { newId, query } from "@/server/common/db";

/** One row of the settlements table (column names mirror SQL). */
export interface SettlementRow {
  id: string;
  /** Group the settlement belongs to; NULL ⇒ a one-off settlement between friends. */
  group_id: string | null;
  /** Id of the user who paid (the debtor settling up). */
  from_user: string;
  /** Id of the user who received the payment (the creditor). */
  to_user: string;
  amount_cents: number;
  currency: string;
  /** Free-form payment method label, e.g. "cash" or "bank transfer". */
  method: string;
  note: string;
  created_at: string;
}

/**
 * Inserts a recorded settlement (a real-world payment between two users).
 *
 * @param input - Settlement details: payer, recipient, amount, currency, method and note.
 * @returns The inserted row, including its generated id and timestamp.
 */
export async function insertSettlement(input: {
  groupId: string | null;
  fromUser: string;
  toUser: string;
  amountCents: number;
  currency: string;
  method: string;
  note: string;
}): Promise<SettlementRow> {
  const rows = await query<SettlementRow>(
    `INSERT INTO settlements (id, group_id, from_user, to_user, amount_cents, currency, method, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      newId(),
      input.groupId,
      input.fromUser,
      input.toUser,
      input.amountCents,
      input.currency,
      input.method,
      input.note,
    ],
  );
  return rows[0];
}

/**
 * Lists a group's settlements, oldest first.
 *
 * @param groupId - Id of the group whose settlements to list.
 * @returns Settlement rows in chronological order.
 */
export async function listSettlementsByGroup(groupId: string): Promise<SettlementRow[]> {
  return query<SettlementRow>(
    `SELECT * FROM settlements WHERE group_id = $1 ORDER BY created_at ASC`,
    [groupId],
  );
}

/**
 * Lists every settlement the user paid or received, oldest first.
 *
 * @param userId - Id of the user involved as payer or recipient.
 * @returns Settlement rows in chronological order.
 */
export async function listSettlementsInvolvingUser(
  userId: string,
): Promise<SettlementRow[]> {
  return query<SettlementRow>(
    `SELECT * FROM settlements WHERE from_user = $1 OR to_user = $1
     ORDER BY created_at ASC`,
    [userId],
  );
}
