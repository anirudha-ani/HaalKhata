/** All SQL for the receipt_scans table: one row per scan attempt, counts only. */

import { execute, newId } from "@/server/common/db";

/** How a scan attempt ended; mirrors chk_receipt_scans_outcome. */
export type ReceiptScanOutcome = "parsed" | "failed";

/**
 * Records that a person tried to scan a receipt and how it ended.
 *
 * Deliberately narrow: nothing about the receipt itself is stored, so this
 * row can answer "how often is scanning used" and nothing a person would
 * mind being asked.
 *
 * @param userId - The authenticated person who uploaded the image.
 * @param outcome - Whether a provider returned line items.
 */
export async function insertReceiptScan(
  userId: string,
  outcome: ReceiptScanOutcome,
): Promise<void> {
  await execute(`INSERT INTO receipt_scans (id, user_id, outcome) VALUES ($1, $2, $3)`, [
    newId(),
    userId,
    outcome,
  ]);
}
