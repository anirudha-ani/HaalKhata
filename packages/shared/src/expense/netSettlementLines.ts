/** Wording for a net settlement's statement lines: the payment, and the balances it cancelled. */

import { formatMoney } from "../money/money";

/** A statement line, reduced to what the wording needs; the API's FriendLedgerEntry carries all of it. */
export interface NetStatementLine {
  /** The net settlement the line belongs to, or "" for anything else. */
  netSettlementId: string;
  /** True for a balance that was cancelled; false for the payment itself. */
  offset: boolean;
  /** True once the line has been removed. */
  deleted: boolean;
  /** What the line did to the reader's balance, signed. */
  deltaCents: number;
  /** ISO 4217 code of the line. */
  currency: string;
}

/**
 * How much one net settlement cancelled in each direction.
 *
 * Its cancelled lines always come in two equal sides (the database refuses
 * anything else), so one side is the answer: the lines that moved the
 * reader's balance up.
 *
 * @param lines - The statement the settlement's lines are part of.
 * @param netSettlementId - The settlement to total.
 * @returns Cents cancelled each way; 0 when none of its cancelled lines are in `lines`.
 */
export function cancelledEachWayCents(
  lines: readonly NetStatementLine[],
  netSettlementId: string,
): number {
  let total = 0;
  for (const line of lines) {
    if (
      line.netSettlementId === netSettlementId &&
      line.offset &&
      !line.deleted &&
      line.deltaCents > 0
    ) {
      total += line.deltaCents;
    }
  }
  return total;
}

/**
 * The tag a statement puts on a line of a net settlement, so the money that
 * moved is never confused with the amounts that only cancelled.
 *
 * A cancelled balance says no money moved. The payment says what else it
 * did, with the amount when its cancelled lines are in view: a long history
 * is cut off somewhere, and a payment at the cut still says it cancelled
 * something, without a figure it cannot see.
 *
 * @param line - The line being labelled.
 * @param lines - The statement it is part of.
 * @returns The tag, or "" for a line that needs none (not part of a net
 *   settlement, or removed).
 */
export function netSettlementTag(line: NetStatementLine, lines: readonly NetStatementLine[]): string {
  if (!line.netSettlementId || line.deleted) return "";
  if (line.offset) return "no money moved";
  const cancelledCents = cancelledEachWayCents(lines, line.netSettlementId);
  return cancelledCents > 0
    ? `also cancelled ${formatMoney(cancelledCents, line.currency)} owed each way`
    : "also cancelled what you owed each other";
}
