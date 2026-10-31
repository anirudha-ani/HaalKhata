/**
 * The cursor of a friend statement. Each line shows the running balance
 * after it, which depends on every older line; the cursor carries that
 * balance from one page to the next, so a later page reads only its own
 * rows instead of the whole history again.
 *
 * Because it carries figures, it is signed, and bound to the reader and the
 * friend: a client cannot change the numbers it is handed back, or use one
 * person's cursor on another's statement. It also carries the fingerprint of
 * the history those figures were worked out from (`pairHistoryDigest`), so
 * a page is refused rather than continued from a history that has changed.
 */

import { signPayload, verifyPayloadSignature } from "@/server/auth/usecase/session/session";
import { isCursorValue, isExactTimestamp } from "@/server/common/pagination/pagination";
import { MAX_CURSOR_LENGTH } from "@/server/common/pagination/pagination.constants";
import { LEDGER_LINE_RANK } from "@/server/expense/expense.constants";
import type { LedgerLineKey } from "@/server/expense/domain/ledgerOrder";

/** Where a statement page ends, and the balances the next one continues from. */
export interface LedgerPosition {
  /** The oldest line already shown. */
  after: LedgerLineKey;
  /**
   * Running balance per currency just before that line, i.e. after every
   * line older than it: > 0 = the friend owes the reader.
   */
  balances: Map<string, number>;
  /** Fingerprint of the pair's history the balances were worked out from. */
  historyDigest: string;
}

/** The cursor's contents, as signed. */
interface LedgerCursorBody {
  /** The reader. */
  reader: string;
  /** The friend whose statement it is. */
  friend: string;
  /** The oldest line shown: day, moment, rank, id. */
  after: [string, string, number, string];
  /** Currency → cents. */
  balances: [string, number][];
  /** The history fingerprint. */
  digest: string;
}

/**
 * Encodes and signs where a statement page ends.
 *
 * @param readerId - The reader.
 * @param friendId - The friend whose statement it is.
 * @param position - The oldest line shown, and the balances before it.
 * @returns The opaque cursor.
 */
export function encodeLedgerCursor(readerId: string, friendId: string, position: LedgerPosition): string {
  const body: LedgerCursorBody = {
    reader: readerId,
    friend: friendId,
    after: [position.after.day, position.after.at, position.after.rank, position.after.id],
    balances: [...position.balances],
    digest: position.historyDigest,
  };
  const payload = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  return `${payload}.${signPayload("ledger-cursor", payload)}`;
}

/**
 * Verifies and decodes a statement cursor.
 *
 * @param cursor - The client's cursor.
 * @param readerId - The caller, who must be the reader it was made for.
 * @param friendId - The friend, who must be the one it was made for.
 * @returns Where the next page starts, or null for a cursor that is forged,
 *   malformed, or made for another statement.
 */
export function decodeLedgerCursor(
  cursor: string,
  readerId: string,
  friendId: string,
): LedgerPosition | null {
  if (cursor.length > MAX_CURSOR_LENGTH) return null;
  const separator = cursor.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = cursor.slice(0, separator);
  if (!verifyPayloadSignature("ledger-cursor", payload, cursor.slice(separator + 1))) return null;
  let body: LedgerCursorBody;
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LedgerCursorBody;
  } catch {
    return null;
  }
  if (body.reader !== readerId || body.friend !== friendId) return null;
  const [lineDay, lineMoment, rank, lineId] = body.after ?? [];
  const ranks: number[] = Object.values(LEDGER_LINE_RANK);
  if (
    typeof lineDay !== "string" || !isCursorValue(lineDay) ||
    typeof lineMoment !== "string" || !isExactTimestamp(lineMoment) ||
    !ranks.includes(rank) ||
    typeof lineId !== "string" || !isCursorValue(lineId) ||
    !Array.isArray(body.balances) ||
    typeof body.digest !== "string"
  ) {
    return null;
  }
  return {
    after: { day: lineDay, at: lineMoment, rank, id: lineId },
    balances: new Map(body.balances),
    historyDigest: body.digest,
  };
}
