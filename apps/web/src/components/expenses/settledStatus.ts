/** Wording for an expense row whose scope owes nothing — pure. */

/** What the row shows: a short label and the precise sentence behind it. */
export interface SettledStatus {
  /** Short state phrase for the row, e.g. "no one owes you here". */
  label: string;
  /** The full claim, offered as a tooltip, naming the scope or the people. */
  explanation: string;
}

/**
 * Joins names the way a sentence would: "Ana", "Ana & Bob", "Ana, Bob & Chen".
 *
 * @param names - Names in display order.
 * @returns The joined phrase; "" for an empty list.
 */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/**
 * Words the "nothing pending" state truthfully for one expense row.
 *
 * The word this replaces — "settled" — overclaimed: it read as a statement
 * about the expense, when the ledger only knows scopes. A settlement pays
 * down a group's balance or a pair's one-off slate, and two expenses can
 * cancel with no payment at all, so the honest statement is about the state
 * that resulted, in the viewer's direction:
 *
 * - money was owed TO the viewer → "no one owes you here": true however the
 *   balance reached zero, and claims nothing about who paid what back.
 * - the viewer owed → "you owe nothing here": same shape, other direction.
 *
 * "here" is the scope — the group named by the row's pill, or the people on
 * a one-off — and the explanation spells that out for the tooltip, so the
 * short label never has to compress the claim into something false.
 *
 * @param viewerLent - True when the expense left others owing the viewer.
 * @param groupExpense - True for a group expense; false for a one-off.
 * @param otherFirstNames - First names of the other people on a one-off
 *   expense; ignored for group expenses.
 * @returns The row label and its tooltip sentence.
 */
export function settledStatus(
  viewerLent: boolean,
  groupExpense: boolean,
  otherFirstNames: readonly string[],
): SettledStatus {
  const label = viewerLent ? "no one owes you here" : "you owe nothing here";
  const scopePhrase = groupExpense
    ? "Your balance in this group is zero"
    : `You and ${joinNames(otherFirstNames) || "the others"} are settled up`;
  return {
    label,
    explanation: `${scopePhrase} — nothing from this expense is pending.`,
  };
}
