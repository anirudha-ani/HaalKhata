/** What one expense means for one person, in the words a notification uses — pure. */

import { formatMoney } from "@haalkhata/shared/money/money";

/** The money on an expense this line reads: who paid, who owes, in what currency. */
export interface ExpenseMoney {
  currency: string;
  payers: { userId: string; amountCents: number }[];
  splits: { userId: string; owedCents: number }[];
}

/**
 * The reader's own line on an expense notification: "you owe Ani ৳600",
 * "you get back ৳1,800", or nothing when the expense leaves them even.
 *
 * It is the reader's net on this expense alone — what they paid minus their
 * share — in integer cents, so it matches the split the server stored. The
 * payer is named only when there is exactly one other payer; with several,
 * "you owe" stands alone rather than pick one of them. A deleted expense
 * gets no line: it no longer moves anything.
 *
 * @param money - The expense's payers, splits and currency.
 * @param readerId - The person the notification is for.
 * @param verb - What happened to the expense.
 * @param payerNames - Display names of the payers who are known.
 * @returns The line, or "" when there is nothing to say.
 */
export function readerShareLine(
  money: ExpenseMoney,
  readerId: string,
  verb: "added" | "updated" | "deleted",
  payerNames: Map<string, string>,
): string {
  if (verb === "deleted") return "";
  const position = readerPosition(money, readerId, payerNames);
  if (position === "") return "";
  return verb === "updated" ? `now you ${position}` : `you ${position}`;
}

/**
 * The line for somebody an edit took off an expense: what they no longer
 * owe or get back from it, read off the expense as it was before the edit.
 *
 * @param before - The expense's payers, splits and currency before the edit.
 * @param readerId - The person who is no longer on it.
 * @param payerNames - Display names of the payers who are known.
 * @returns "you're no longer on it", with what that undid when it moved them.
 */
export function removedReaderLine(
  before: ExpenseMoney,
  readerId: string,
  payerNames: Map<string, string>,
): string {
  const position = readerPosition(before, readerId, payerNames);
  return position === "" ? "you're no longer on it" : `you're no longer on it, so you no longer ${position}`;
}

/**
 * What an expense means for one person, as the rest of a sentence about
 * them: "owe Ani ৳600", "get back ৳1,800", or "" when it leaves them even.
 *
 * @param money - The expense's payers, splits and currency.
 * @param readerId - The person it is read for.
 * @param payerNames - Display names of the payers who are known.
 * @returns The phrase without its subject, or "".
 */
function readerPosition(
  money: ExpenseMoney,
  readerId: string,
  payerNames: Map<string, string>,
): string {
  const paidCents = money.payers
    .filter((payer) => payer.userId === readerId)
    .reduce((total, payer) => total + payer.amountCents, 0);
  const owedCents = money.splits
    .filter((split) => split.userId === readerId)
    .reduce((total, split) => total + split.owedCents, 0);
  const netCents = paidCents - owedCents;
  if (netCents === 0) return "";
  const amount = formatMoney(Math.abs(netCents), money.currency);
  if (netCents > 0) return `get back ${amount}`;
  const otherPayers = [...new Set(money.payers.map((payer) => payer.userId))].filter((payerId) => payerId !== readerId);
  const payerName = otherPayers.length === 1 ? payerNames.get(otherPayers[0]) : undefined;
  return payerName ? `owe ${payerName} ${amount}` : `owe ${amount}`;
}
