/** Reading a settle position for a dialog: what one opening of it settles, which way, and in what order it is listed. */

import { formatMoney } from "../money/money";

/** One balance inside a settle position, as the API's SettleScope carries it. */
export interface SettleScopeLike {
  /** Group id, or "" for the pair's direct (non-group) slate. */
  groupId: string;
  /** The group's name; unused for the direct slate. */
  groupName: string;
  /** Signed balance from the reader's side: > 0 means the other person owes them. */
  netCents: number;
  /** True when the group simplifies debts, so the balance is a rerouted one. */
  simplified?: boolean;
}

/** A pair's position in one currency, as the API's SettlePosition carries it. */
export interface SettlePositionLike {
  /** ISO 4217 code. */
  currency: string;
  /** Net across the scopes from the reader's side: > 0 means the other person owes them. */
  netCents: number;
  /** The balances behind the net. */
  scopes: readonly SettleScopeLike[];
  /** Fingerprint a settlement of the whole position sends back. */
  digest: string;
}

/** One balance as a settle dialog lists it. */
export interface SettleScopeRow {
  /** Group id, or "" for the direct (non-group) balance. */
  scopeId: string;
  /** Name shown for the balance. */
  label: string;
  /** Signed balance from the reader's side: > 0 means the other person owes them. */
  netCents: number;
  /** True when the group simplifies debts, so the balance is a rerouted one. */
  simplified: boolean;
}

/** What one opening of a settle dialog settles, in one currency. */
export interface SettleReading {
  /** Currencies in which this opening has something to settle. */
  currencies: string[];
  /** The balances the payment settles, in display order; empty when the currency holds nothing. */
  rows: SettleScopeRow[];
  /** What changes hands, signed from the reader's side: > 0 means the other person pays them. */
  netCents: number;
  /** True when it settles every balance with the person; false when it settles one. */
  everything: boolean;
  /** Fingerprint to send back with a settlement of everything; "" for one balance. */
  digest: string;
}

/**
 * The name a balance goes by wherever it is shown: its group's, or the one
 * phrase for what the pair owes outside any group. One name, so a row on a
 * page and the dialog it opens are plainly the same balance.
 *
 * @param groupId - Group id, or "" for the direct (non-group) balance.
 * @param groupName - The group's name; unused for the direct balance.
 * @returns The label.
 */
export function scopeLabel(groupId: string, groupName: string): string {
  return groupId ? groupName || "Unnamed group" : "Not in any group";
}

/**
 * A position's balances as rows for a dialog: the direct slate first, since
 * it is the pair's own account, then the rest largest first.
 *
 * @param scopes - The position's balances; settled ones are dropped.
 * @returns Labelled rows in display order.
 */
export function settleScopeRows(scopes: readonly SettleScopeLike[]): SettleScopeRow[] {
  return scopes
    .filter((scope) => scope.netCents !== 0)
    .map((scope) => ({
      scopeId: scope.groupId,
      label: scopeLabel(scope.groupId, scope.groupName),
      netCents: scope.netCents,
      simplified: scope.simplified ?? false,
    }))
    .sort((first, second) => {
      if (first.scopeId === "") return -1;
      if (second.scopeId === "") return 1;
      return (
        Math.abs(second.netCents) - Math.abs(first.netCents) ||
        first.label.localeCompare(second.label)
      );
    });
}

/**
 * Works out what a settle dialog is about to settle.
 *
 * The rule is the page's: a dialog opened beside a total settles the total,
 * and one opened beside a single balance settles that balance. Opened for a
 * person (no `scopeId`) it covers every balance the pair has in the currency
 * and what changes hands is their net, so balances pointing the other way
 * are counted. Opened for one balance — a group, or what is owed outside
 * groups — it covers that balance and nothing else, whatever else the pair
 * owes each other.
 *
 * @param positions - The pair's positions from the server, one per currency.
 * @param currency - The currency the dialog is on.
 * @param scopeId - Omitted to settle everything with the person; a group id
 *   to settle that group's balance; "" to settle what is not in any group.
 * @returns What is settled in `currency`, and the currencies worth offering.
 */
export function readSettlePositions(
  positions: readonly SettlePositionLike[],
  currency: string,
  scopeId?: string,
): SettleReading {
  const everything = scopeId === undefined;
  const position = positions.find((candidate) => candidate.currency === currency);
  if (everything) {
    return {
      currencies: positions
        .filter((candidate) => candidate.netCents !== 0)
        .map((candidate) => candidate.currency),
      rows: position && position.netCents !== 0 ? settleScopeRows(position.scopes) : [],
      netCents: position?.netCents ?? 0,
      everything,
      digest: position?.digest ?? "",
    };
  }
  const holds = (candidate: SettlePositionLike) =>
    candidate.scopes.some((scope) => scope.groupId === scopeId && scope.netCents !== 0);
  const rows = settleScopeRows(
    (position?.scopes ?? []).filter((scope) => scope.groupId === scopeId),
  );
  return {
    currencies: positions.filter(holds).map((candidate) => candidate.currency),
    rows,
    netCents: rows[0]?.netCents ?? 0,
    everything,
    digest: "",
  };
}

/**
 * The refusal shown when someone types more than a dialog settles, naming
 * the figure and where it comes from.
 *
 * @param reading - What the dialog settles.
 * @param currency - The currency it is on.
 * @param firstName - The other person's first name.
 * @returns The message.
 */
export function settleOverLimitMessage(
  reading: SettleReading,
  currency: string,
  firstName: string,
): string {
  const owed = `${formatMoney(Math.abs(reading.netCents), currency)} ${
    reading.netCents > 0 ? `${firstName} owes you` : "you owe"
  }`;
  if (reading.everything) return `that's more than the ${owed} overall`;
  const only = reading.rows[0];
  return `that's more than the ${owed} ${only?.scopeId ? `in ${only.label}` : "outside groups"}`;
}
