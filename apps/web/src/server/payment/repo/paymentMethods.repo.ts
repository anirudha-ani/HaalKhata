/** All SQL for payment_methods and payment_method_details. */

import type { PoolClient } from "pg";
import { execute, query, queryOne } from "@/server/common/db";

/** One labelled identifier of a payment method, as stored. */
export interface PaymentDetailRow {
  /** A key from the shared DETAIL_KINDS catalog. */
  kind: string;
  /** The owner's own label; empty unless kind is "custom". */
  label: string;
  value: string;
}

/** One row of payment_methods with its details folded in, in the owner's order. */
export interface PaymentMethodRow {
  id: string;
  user_id: string;
  name: string;
  /** ISO 4217 code the method works in; null means any currency. */
  currency: string | null;
  /** Key of a built-in app; null for a method the person defined. */
  preset: string | null;
  note: string;
  is_preferred: boolean;
  /** When it was given the star; null when unstarred, or starred before this was recorded. */
  preferred_at: string | null;
  created_at: string;
  /** When the name, currency, details or note last changed; starring does not move it. */
  updated_at: string;
  details: PaymentDetailRow[];
}

/** The part of a payment method its owner types, validated and ready to store. */
export interface PaymentMethodWrite {
  name: string;
  /** ISO 4217 code; null for any currency. */
  currency: string | null;
  note: string;
  /** At least one, already in order. */
  details: PaymentDetailRow[];
}

/**
 * Every payment_methods column plus the method's details as a JSON array.
 *
 * Folded into the lookups themselves so a method is never handed out without
 * its details: without them it is a name with nowhere to send money.
 */
const METHOD_COLUMNS = `method.*, COALESCE((
  SELECT json_agg(json_build_object('kind', detail.kind, 'label', detail.label, 'value', detail.value)
                  ORDER BY detail.position)
  FROM payment_method_details detail WHERE detail.method_id = method.id
), '[]'::json) AS details`;

/**
 * Lists a person's payment methods, oldest first.
 *
 * @param userId - Owner of the methods.
 * @param client - Existing transaction client; omitted to use the shared pool.
 * @returns The methods with their details.
 */
export async function listPaymentMethodsByUser(
  userId: string,
  client?: PoolClient,
): Promise<PaymentMethodRow[]> {
  return query<PaymentMethodRow>(
    `SELECT ${METHOD_COLUMNS} FROM payment_methods method
      WHERE method.user_id = $1
      ORDER BY method.created_at, method.id`,
    [userId],
    client,
  );
}

/**
 * Fetches one payment method, but only for its owner.
 *
 * The owner is part of the lookup rather than checked afterwards, so asking
 * for somebody else's method is indistinguishable from asking for one that
 * does not exist.
 *
 * @param methodId - Id of the method.
 * @param userId - Who must own it.
 * @param client - Existing transaction client; omitted to use the shared pool.
 * @returns The method, or undefined when there is no such method of theirs.
 */
export async function findPaymentMethod(
  methodId: string,
  userId: string,
  client?: PoolClient,
): Promise<PaymentMethodRow | undefined> {
  return queryOne<PaymentMethodRow>(
    `SELECT ${METHOD_COLUMNS} FROM payment_methods method
      WHERE method.id = $1 AND method.user_id = $2`,
    [methodId, userId],
    client,
  );
}

/**
 * Counts a person's payment methods.
 *
 * @param userId - Owner of the methods.
 * @param client - Transaction client holding the owner's payment-methods lock.
 * @returns How many methods they have.
 */
export async function countPaymentMethods(userId: string, client: PoolClient): Promise<number> {
  const counted = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM payment_methods WHERE user_id = $1`,
    [userId],
    client,
  );
  return counted?.total ?? 0;
}

/**
 * Writes a method's details as one statement, numbering them in the order given.
 *
 * @param methodId - Method the details belong to.
 * @param details - The details, in the owner's order.
 * @param client - Transaction client the method row is being written on.
 */
async function insertDetails(
  methodId: string,
  details: PaymentDetailRow[],
  client: PoolClient,
): Promise<void> {
  await execute(
    `INSERT INTO payment_method_details (method_id, position, kind, label, value)
     SELECT $1, (detail.ordinality - 1)::int, detail.kind, detail.label, detail.value
       FROM unnest($2::text[], $3::text[], $4::text[])
            WITH ORDINALITY AS detail(kind, label, value, ordinality)`,
    [
      methodId,
      details.map((detail) => detail.kind),
      details.map((detail) => detail.label),
      details.map((detail) => detail.value),
    ],
    client,
  );
}

/**
 * Inserts a payment method with its details.
 *
 * @param input - The new method: its id, owner, preset, star and typed fields.
 * @param client - Transaction client; the method and its details commit together.
 * @returns The stored method with its details.
 */
export async function insertPaymentMethod(
  input: PaymentMethodWrite & {
    id: string;
    userId: string;
    preset: string | null;
    preferred: boolean;
  },
  client: PoolClient,
): Promise<PaymentMethodRow> {
  await execute(
    `INSERT INTO payment_methods
            (id, user_id, name, currency, preset, note, is_preferred, preferred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 THEN now() END)`,
    [
      input.id,
      input.userId,
      input.name,
      input.currency,
      input.preset,
      input.note,
      input.preferred,
    ],
    client,
  );
  await insertDetails(input.id, input.details, client);
  return (await findPaymentMethod(input.id, input.userId, client))!;
}

/**
 * Replaces one of a person's methods and its details.
 *
 * The owner is part of the statement, not only of the lookup that came
 * before it: a method that is not this person's, or was removed a moment
 * ago, matches nothing, and then its details are left alone too.
 *
 * @param methodId - Id of the method to replace.
 * @param write - Its new name, currency, note and details.
 * @param userId - Owner of the method.
 * @param client - The transaction's client.
 * @returns False when the person has no such method any more.
 */
export async function updatePaymentMethod(
  methodId: string,
  write: PaymentMethodWrite,
  userId: string,
  client: PoolClient,
): Promise<boolean> {
  const updated = await query<{ id: string }>(
    `UPDATE payment_methods
        SET name = $3, currency = $4, note = $5, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [methodId, userId, write.name, write.currency, write.note],
    client,
  );
  if (updated.length === 0) return false;
  await execute(`DELETE FROM payment_method_details WHERE method_id = $1`, [methodId], client);
  await insertDetails(methodId, write.details, client);
  return true;
}

/**
 * Deletes one of a person's methods; its details go with it.
 *
 * @param methodId - Id of the method to delete.
 * @param userId - Owner of the method.
 * @param client - The transaction's client.
 * @returns False when the person has no such method.
 */
export async function deletePaymentMethod(
  methodId: string,
  userId: string,
  client: PoolClient,
): Promise<boolean> {
  const deleted = await query<{ id: string }>(
    `DELETE FROM payment_methods WHERE id = $1 AND user_id = $2 RETURNING id`,
    [methodId, userId],
    client,
  );
  return deleted.length > 0;
}

/**
 * Deletes the old payment handle a method was copied from, if it was.
 *
 * The backfill gave each copied method an id derived from its handle's key,
 * and left the handles table in place so the copy could be undone. That
 * table would otherwise keep a handle its owner has since removed or
 * replaced, and running the copy again would bring a removed method back.
 * This goes when the table does.
 *
 * @param methodId - Id of the method that was changed or removed.
 * @param userId - Owner of the method.
 * @param client - The transaction's client.
 */
export async function forgetLegacyHandle(
  methodId: string,
  userId: string,
  client: PoolClient,
): Promise<void> {
  await execute(
    `DELETE FROM payment_handles
      WHERE user_id = $2
        AND md5('payment-handle:' || user_id || ':' || method)::uuid::text = $1`,
    [methodId, userId],
    client,
  );
}

/**
 * Takes the star off whichever of a person's methods holds it for a currency.
 *
 * @param userId - Owner of the methods.
 * @param currency - ISO 4217 code, or null for the any-currency bucket.
 * @param client - Transaction client holding the owner's payment-methods lock.
 */
export async function clearPreferred(
  userId: string,
  currency: string | null,
  client: PoolClient,
): Promise<void> {
  await execute(
    `UPDATE payment_methods SET is_preferred = FALSE, preferred_at = NULL
      WHERE user_id = $1 AND is_preferred
        AND COALESCE(currency, '') = COALESCE($2::text, '')`,
    [userId, currency],
    client,
  );
}

/**
 * Sets or clears the star on one of a person's methods, and with it the
 * time the star was given. The caller clears the currency bucket first when
 * setting it, and does not call this for a method that is keeping a star it
 * already has: that would date an old star as new.
 *
 * @param methodId - Id of the method.
 * @param preferred - Whether it carries the star.
 * @param userId - Owner of the method.
 * @param client - The transaction's client.
 */
export async function setPreferred(
  methodId: string,
  preferred: boolean,
  userId: string,
  client: PoolClient,
): Promise<void> {
  await execute(
    `UPDATE payment_methods
        SET is_preferred = $2, preferred_at = CASE WHEN $2 THEN now() END
      WHERE id = $1 AND user_id = $3`,
    [methodId, preferred, userId],
    client,
  );
}

/**
 * Remembers that a person removed a payment method just now.
 *
 * @param userId - Who removed one.
 * @param client - The transaction's client.
 */
export async function recordMethodRemoval(userId: string, client: PoolClient): Promise<void> {
  await execute(
    `INSERT INTO payment_method_removals (user_id, removed_at) VALUES ($1, now())
     ON CONFLICT (user_id) DO UPDATE SET removed_at = EXCLUDED.removed_at`,
    [userId],
    client,
  );
}

/**
 * Reads when a person last removed a payment method.
 *
 * @param userId - Whose removals to look up.
 * @param client - Optional client, for reading inside a snapshot.
 * @returns The time, or undefined when they never removed one.
 */
export async function findMethodRemoval(
  userId: string,
  client?: PoolClient,
): Promise<string | undefined> {
  const found = await queryOne<{ removed_at: string }>(
    `SELECT removed_at FROM payment_method_removals WHERE user_id = $1`,
    [userId],
    client,
  );
  return found?.removed_at;
}
