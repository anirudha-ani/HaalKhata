/** The sentences an itemized summary shows about money that is not yet accounted for. */

import { formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";

/** The two fields of a line item the warnings depend on; any item shape with them fits. */
export interface WarnableItem {
  /** Raw money input for the line total. */
  total: string;
  /** Portion count per user id; 0 or absent means "not on this item". */
  assignees: Record<string, number>;
}

/**
 * Describes what still needs doing before an itemized bill adds up: the money
 * on lines nobody is on, and the count of lines with no usable amount. Reads
 * the draft with the same rules the submit check applies, so the summary
 * never says "everything is assigned" while the save button disagrees.
 *
 * @param items - The itemized draft.
 * @param currency - ISO 4217 code the amounts are typed in.
 * @returns Zero, one or two short sentences, unassigned money first.
 */
export function itemizedWarnings(items: WarnableItem[], currency: string): string[] {
  let unassignedCents = 0;
  let missingAmounts = 0;
  for (const item of items) {
    const cents = parseMoneyInput(item.total, currency);
    if (cents === null || cents <= 0) {
      missingAmounts += 1;
      continue;
    }
    if (!Object.values(item.assignees).some((weight) => weight > 0)) unassignedCents += cents;
  }
  const warnings: string[] = [];
  if (unassignedCents > 0) warnings.push(`${formatMoney(unassignedCents, currency)} unassigned`);
  if (missingAmounts > 0) {
    const plural = missingAmounts === 1 ? "" : "s";
    const verb = missingAmounts === 1 ? "needs" : "need";
    warnings.push(`${missingAmounts} item${plural} ${verb} an amount`);
  }
  return warnings;
}
