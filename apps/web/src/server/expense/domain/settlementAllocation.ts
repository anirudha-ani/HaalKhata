/** Allocation of one payment across the scopes where the payer's debt lives — pure. */

import { createHash } from "node:crypto";

/** How much the payer owes the creditor inside one scope, in one currency. */
export interface ScopeDebt {
  /** Group the debt lives in, or null for the pair's one-off ledger. */
  groupId: string | null;
  /** ISO 4217 code the debt is denominated in. */
  currency: string;
  /** Cents the payer owes the creditor in this scope; always > 0. */
  owedCents: number;
}

/** A scope debt with the two people it runs between named. */
export interface DirectedScopeDebt extends ScopeDebt {
  /** Who owes. */
  debtorId: string;
  /** Who is owed. */
  creditorId: string;
}

/**
 * Fingerprints everything two people owe each other in one currency.
 *
 * A net settlement cancels balances against each other, so what it cancels
 * has to be exactly what the person agreed to. The dialog is given this
 * digest with the position it shows and sends it back; the write recomputes
 * it under its locks and refuses on any difference — a new expense, a
 * payment from the other side, a debt rerouted by simplification.
 *
 * It names people by id and each debt by its own direction, so it is the
 * same whichever of the two is asking, and whichever way the payment runs.
 *
 * @param currency - The currency being settled.
 * @param debts - The pair's debts in every scope, both directions; other
 *   currencies are ignored.
 * @returns A hex SHA-256 over the canonical, sorted list of those debts.
 */
export function positionDigest(currency: string, debts: readonly DirectedScopeDebt[]): string {
  const lines = debts
    .filter((debt) => debt.currency === currency)
    .map((debt) => `${debt.groupId ?? ""}|${debt.debtorId}|${debt.creditorId}|${debt.owedCents}`)
    .sort();
  return createHash("sha256")
    .update([currency, ...lines].join("\n"))
    .digest("hex");
}

/** One recorded slice of a payment: which scope it pays down, and how much. */
export interface SettlementPortion {
  /** Scope the slice is recorded in; null = the one-off pair ledger. */
  groupId: string | null;
  /** ISO 4217 code of the slice — the scope's, which is the payment's. */
  currency: string;
  /** Cents recorded in that scope; always > 0. */
  amountCents: number;
}

/**
 * Splits a payment across the scopes where the payer actually owes money.
 *
 * A debt lives in exactly one scope — a group, or the pair's one-off ledger —
 * and each scope's balance only sees its own settlement rows. A payment that
 * covers group debt therefore has to be *recorded in that group*, or the
 * group goes on demanding money that has already changed hands. This function
 * decides that placement, once, at write time. Deciding it at read time
 * instead would re-allocate history whenever a new expense arrives, silently
 * rewriting past statements.
 *
 * Every scope passed in must be in the payment's currency; the caller
 * filters. A dollar cannot pay down a euro, and placing a payment by the
 * size of numbers in different currencies would be placing it by nothing.
 *
 * Order: the one-off ledger first, then groups by largest debt, ties by group
 * id. One-off first because it is the pair's direct account — the group
 * scopes are shared with other people and their statements should move only
 * when the direct slate could not absorb the payment. The order is
 * deterministic so the same payment always lands the same way.
 *
 * The caller must have verified `amountCents` ≤ the sum of `scopes` debts;
 * anything left after every scope is filled is silently unallocated, which
 * the guard upstream exists to prevent.
 *
 * @param scopes - Per-scope debts of payer → creditor, every amount > 0, all
 *   in one currency.
 * @param amountCents - The payment to place; > 0.
 * @returns One portion per scope touched, in allocation order; sums to
 *   `amountCents` when the debts cover it.
 * @throws Error when the scopes span more than one currency — a programming
 *   error upstream, never a user input.
 */
export function allocateSettlement(
  scopes: readonly ScopeDebt[],
  amountCents: number,
): SettlementPortion[] {
  if (new Set(scopes.map((scope) => scope.currency)).size > 1) {
    throw new Error("allocateSettlement: scopes span more than one currency");
  }
  // At most one scope has groupId null per currency (the pair has a single
  // one-off ledger per currency), so the null-first comparison never has to
  // order two nulls.
  const ordered = [...scopes].sort((first, second) => {
    if (first.groupId === null) return -1;
    if (second.groupId === null) return 1;
    return second.owedCents - first.owedCents || first.groupId.localeCompare(second.groupId);
  });

  const portions: SettlementPortion[] = [];
  let remainingCents = amountCents;
  for (const scope of ordered) {
    if (remainingCents <= 0) break;
    const sliceCents = Math.min(scope.owedCents, remainingCents);
    if (sliceCents > 0) {
      portions.push({ groupId: scope.groupId, currency: scope.currency, amountCents: sliceCents });
      remainingCents -= sliceCents;
    }
  }
  return portions;
}

/** A payment settled on a pair's net: the cash that moved, and the entries that cancel what points the other way. */
export interface NetSettlementPlan {
  /** Slices of the cash, recorded payer → creditor. */
  cash: SettlementPortion[];
  /** Slices of the payer's debt cancelled without cash, recorded payer → creditor. */
  offsetOwing: SettlementPortion[];
  /** Each opposing balance, cancelled in full and recorded creditor → payer. */
  offsetOpposing: SettlementPortion[];
}

/**
 * Plans a payment that settles two people on their net in one currency.
 *
 * Two people can owe each other in different scopes at once: the payer owes
 * 300 outside groups while being owed 200 inside one. The pair's balance is
 * the net, 100, and that is all the cash that should move. But a debt lives
 * in exactly one scope and each scope reads only its own rows, so 100 in cash
 * alone would leave the group still showing 200 owed and the direct slate
 * 200 the other way, for good. The balances that cancel have to be cancelled
 * where they live.
 *
 * So the plan has three parts, and the last two sum to zero cash:
 * 1. the cash, placed across what the payer owes exactly as an ordinary
 *    cross-scope payment of that amount would be;
 * 2. the rest of what the payer owes, up to the opposing total, cancelled;
 * 3. every opposing balance cancelled in full, recorded the other way round.
 *
 * Cash is placed first so its rows are the same ones a plain payment makes;
 * only what cash did not reach is offset. After a payment of the full net
 * every scope the pair shares in the currency is at zero. After a partial
 * one the opposing scopes are at zero and what is left of the net stays in
 * the payer's scopes, in allocation order.
 *
 * The caller must have checked that the payer is behind overall and that
 * `amountCents` is at most the net; both lists must be in one currency.
 *
 * @param owing - Per-scope debts of payer → creditor, every amount > 0.
 * @param opposing - Per-scope debts of creditor → payer, every amount > 0.
 * @param amountCents - The cash moving payer → creditor; > 0.
 * @returns The rows to record, cash first.
 */
export function planNetSettlement(
  owing: readonly ScopeDebt[],
  opposing: readonly ScopeDebt[],
  amountCents: number,
): NetSettlementPlan {
  const cash = allocateSettlement(owing, amountCents);
  const paidByScope = new Map(cash.map((portion) => [portion.groupId, portion.amountCents]));
  const stillOwing = owing
    .map((scope) => ({
      ...scope,
      owedCents: scope.owedCents - (paidByScope.get(scope.groupId) ?? 0),
    }))
    .filter((scope) => scope.owedCents > 0);
  const opposingCents = opposing.reduce((running, scope) => running + scope.owedCents, 0);
  // Reuses the allocation order, and its guard against mixed currencies.
  const offsetOpposing = allocateSettlement(opposing, opposingCents);
  return {
    cash,
    offsetOwing: allocateSettlement(stillOwing, opposingCents),
    offsetOpposing,
  };
}
