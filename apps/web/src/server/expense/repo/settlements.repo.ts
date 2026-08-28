/** All SQL for the settlements table. */

import type { PoolClient } from "pg";
import { newId, query, transaction } from "@/server/common/db";

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
 * Serializes all settlement writes between one pair of users.
 *
 * Runs `operation` inside a transaction that first takes a Postgres advisory
 * lock keyed on the ordered pair. Every settlement writer must go through
 * this: the over-settle guard is a read followed by an insert, and without
 * the lock two concurrent recordings both read the same outstanding debt,
 * both pass, and both insert — the pair ends up double-settled.
 *
 * Every validation read and insert inside `operation` must use the provided
 * client. Borrowing from the shared pool while this transaction holds one
 * connection lets enough concurrent settlements deadlock the pool waiting for
 * second connections; one client also guarantees read-your-own-writes.
 *
 * @param firstUserId - One side of the pair, in either order.
 * @param secondUserId - The other side.
 * @param operation - Validation + inserts to run while the pair is locked.
 * @returns Whatever `operation` returns; the lock releases on commit/rollback.
 */
export async function withSettlementPairLock<Outcome>(
  firstUserId: string,
  secondUserId: string,
  operation: (client: PoolClient) => Promise<Outcome>,
): Promise<Outcome> {
  const [lowUserId, highUserId] =
    firstUserId < secondUserId ? [firstUserId, secondUserId] : [secondUserId, firstUserId];
  return transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `settlement:${lowUserId}|${highUserId}`,
    ]);
    return operation(client);
  });
}

/**
 * Inserts a recorded settlement (a real-world payment between two users).
 *
 * @param input - Settlement details: payer, recipient, amount, currency, method and note.
 * @param client - Transaction client when the insert must commit with a
 *   surrounding {@link withSettlementPairLock} window; omitted, it autocommits.
 * @returns The inserted row, including its generated id and timestamp.
 */
export async function insertSettlement(
  input: {
    groupId: string | null;
    fromUser: string;
    toUser: string;
    amountCents: number;
    currency: string;
    method: string;
    note: string;
  },
  client?: PoolClient,
): Promise<SettlementRow> {
  const text = `INSERT INTO settlements (id, group_id, from_user, to_user, amount_cents, currency, method, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`;
  const params = [
    newId(),
    input.groupId,
    input.fromUser,
    input.toUser,
    input.amountCents,
    input.currency,
    input.method,
    input.note,
  ];
  if (client) {
    const { rows } = await client.query<SettlementRow>(text, params as never[]);
    return rows[0];
  }
  return (await query<SettlementRow>(text, params))[0];
}

/**
 * Lists a group's settlements, oldest first.
 *
 * @param groupId - Id of the group whose settlements to list.
 * @returns Settlement rows in chronological order.
 */
export async function listSettlementsByGroup(
  groupId: string,
  client?: PoolClient,
): Promise<SettlementRow[]> {
  return query<SettlementRow>(
    `SELECT * FROM settlements WHERE group_id = $1 ORDER BY created_at ASC`,
    [groupId],
    client,
  );
}

/**
 * Lists every settlement between two users, in either direction and in any
 * scope (group or one-off), oldest first.
 *
 * @param firstUserId - One of the two people.
 * @param secondUserId - The other person.
 * @returns Settlement rows between the pair, in chronological order.
 */
export async function listSettlementsBetween(
  firstUserId: string,
  secondUserId: string,
): Promise<SettlementRow[]> {
  return query<SettlementRow>(
    `SELECT * FROM settlements
     WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)
     ORDER BY created_at ASC`,
    [firstUserId, secondUserId],
  );
}

/**
 * Lists the one-off (non-group) settlements between two users, either
 * direction, oldest first. This is the settlement side of the pair's one-off
 * ledger — group-scoped rows belong to their group's ledger and are
 * deliberately excluded.
 *
 * @param firstUserId - One of the two people.
 * @param secondUserId - The other person.
 * @returns One-off settlement rows between the pair, in chronological order.
 */
export async function listOneOffSettlementsBetween(
  firstUserId: string,
  secondUserId: string,
  client?: PoolClient,
): Promise<SettlementRow[]> {
  return query<SettlementRow>(
    `SELECT * FROM settlements
     WHERE group_id IS NULL
       AND ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
     ORDER BY created_at ASC`,
    [firstUserId, secondUserId],
    client,
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
