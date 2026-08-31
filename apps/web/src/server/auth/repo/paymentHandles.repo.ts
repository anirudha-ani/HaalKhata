/** All SQL for the payment_handles table. */

import type { PoolClient } from "pg";
import { execute, transaction } from "@/server/common/db";

/**
 * Replaces a user's entire set of payment handles.
 *
 * Delete-then-insert rather than upsert: the request carries the full set, so
 * a method the user removed has to disappear, and doing both in one
 * transaction means a failure never leaves them with half a set.
 *
 * @param userId - Owner of the handles.
 * @param handles - The complete new set; blank handles are dropped.
 * @param client - Existing transaction client when the handles must commit with a profile update.
 */
export async function replacePaymentHandles(
  userId: string,
  handles: { method: string; handle: string }[],
  client?: PoolClient,
): Promise<void> {
  const persist = async (transactionClient: PoolClient): Promise<void> => {
    await transactionClient.query(`DELETE FROM payment_handles WHERE user_id = $1`, [userId]);
    for (const entry of handles) {
      const handle = entry.handle.trim();
      if (handle === "") continue;
      await transactionClient.query(
        `INSERT INTO payment_handles (user_id, method, handle) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, method) DO UPDATE SET handle = EXCLUDED.handle`,
        [userId, entry.method, handle],
      );
    }
  };
  if (client) await persist(client);
  else await transaction(persist);
}

/**
 * Removes every payment handle for a user.
 *
 * @param userId - Owner of the handles to clear.
 */
export async function clearPaymentHandles(userId: string): Promise<void> {
  await execute(`DELETE FROM payment_handles WHERE user_id = $1`, [userId]);
}
