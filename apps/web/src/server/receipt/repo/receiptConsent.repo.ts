/** SQL persistence for account-owned receipt-sharing permission. */

import { execute, queryOne } from "@/server/common/db/db";

/** @param userId Signed-in account. @returns Its saved disclosure version, if any. */
export async function findReceiptConsent(userId: string): Promise<string | undefined> {
  const record = await queryOne<{ consent_version: string }>(
    "SELECT consent_version FROM receipt_consents WHERE user_id = $1", [userId],
  );
  return record?.consent_version;
}

/** @param userId Account granting permission. @param version Reviewed sharing terms. */
export async function saveReceiptConsent(userId: string, version: string): Promise<void> {
  await execute(`INSERT INTO receipt_consents (user_id, consent_version) VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET consent_version = EXCLUDED.consent_version, granted_at = now()`, [userId, version]);
}

/** @param userId Account withdrawing permission on all its devices. */
export async function removeReceiptConsent(userId: string): Promise<void> {
  await execute("DELETE FROM receipt_consents WHERE user_id = $1", [userId]);
}
