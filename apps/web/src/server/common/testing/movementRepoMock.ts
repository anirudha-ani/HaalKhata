/** In-memory movement repository for balance unit scenarios; SQL is exercised separately against PostgreSQL. */
import * as expenses from "@/server/expense/repo/expenses.repo";
import * as settlements from "@/server/expense/repo/settlements.repo";
import { expenseDebts, pairwiseBalances } from "@/server/expense/domain/balances";
import { compareLedgerLineKeys } from "@/server/expense/domain/ledgerOrder";
import { LEDGER_LINE_RANK, OFFSET_SETTLEMENT_METHOD } from "@/server/expense/expense.constants";
import type { MovementTotal, PairHistoryTotal } from "@/server/expense/repo/movements.repo";
import type { PoolClient } from "pg";

/**
 * Applies the pure domain allocator to an existing unit fixture.
 * @param rows - Fixture expenses.
 * @param children - Fixture payers and shares.
 * @returns Directed debts.
 */
function debts(rows: expenses.ExpenseRow[], children: expenses.ExpenseChildren) {
  return rows.flatMap((expense) => expenseDebts(
    (children.payers.get(expense.id) ?? []).map((payer) => ({ userId: payer.user_id, amountCents: payer.amount_cents })),
    (children.splits.get(expense.id) ?? []).map((split) => ({ userId: split.user_id, amountCents: split.owed_cents })),
  ));
}

/**
 * Aggregates the existing unit fixtures by pair and currency.
 * @param groupIds - Requested groups, or null for direct history.
 * @param client - Fixture snapshot client.
 * @param viewerId - Viewer.
 * @param otherId - Friend for direct history.
 * @returns Fixture scope totals.
 */
export async function sumScopeMovements(groupIds: readonly string[] | null, client?: PoolClient, viewerId?: string, otherId?: string): Promise<MovementTotal[]> {
  if (groupIds?.length === 0) return [];
  const rows = groupIds ? await expenses.listExpensesByGroups(groupIds, client) : await expenses.listOneOffExpensesBetween(viewerId!, otherId!, client);
  const payments = groupIds ? await settlements.listSettlementsByGroups(groupIds, client) : await settlements.listOneOffSettlementsBetween(viewerId!, otherId!, client);
  return fixtureTotals(rows, payments, client, viewerId, otherId ? [otherId] : undefined);
}

/**
 * Computes all fixture pair positions without coupling unit tests to SQL.
 * @param viewerId - Reader.
 * @param client - Fixture client.
 * @returns Aggregated fixture movements across scopes.
 */
export async function sumUserMovements(viewerId: string, client: PoolClient): Promise<MovementTotal[]> {
  return fixtureTotals(await expenses.listExpensesInvolvingUser(viewerId, client), await settlements.listSettlementsInvolvingUser(viewerId, client), client, viewerId);
}

/**
 * Computes the requested fixture scope and counterparties.
 * @param viewerId - Reader.
 * @param counterparties - Requested people.
 * @param groupId - Group scope or direct slate.
 * @param client - Fixture client.
 * @returns Requested fixture movements.
 */
export async function sumScopedPairMovements(viewerId: string, counterparties: readonly string[], groupId: string | null, client?: PoolClient): Promise<MovementTotal[]> {
  const rows = await expenses.listScopedExpensesWithAnyOf(viewerId, counterparties, client, groupId);
  const payments = await settlements.listScopedSettlementsWithAnyOf(viewerId, counterparties, client, groupId);
  return fixtureTotals(rows, payments, client, viewerId, counterparties);
}

/**
 * Uses the independent pure allocator to aggregate existing test fixtures.
 * @param rows - Fixture expenses.
 * @param payments - Fixture payments.
 * @param client - Fixture client.
 * @param viewerId - Optional reader filter.
 * @param counterparties - Optional counterparty filter.
 * @returns Normalized fixture totals.
 */
async function fixtureTotals(rows: expenses.ExpenseRow[], payments: settlements.SettlementRow[], client?: PoolClient, viewerId?: string, counterparties?: readonly string[]): Promise<MovementTotal[]> {
  const children = await expenses.loadExpenseChildren(rows.map((entry) => entry.id), client, false);
  const result: MovementTotal[] = [];
  for (const groupId of new Set([...rows, ...payments].map((entry) => entry.group_id))) {
    const currencies = new Set([...rows, ...payments].filter((entry) => entry.group_id === groupId).map((entry) => entry.currency));
    for (const currency of currencies) {
      const matches = (entry: { group_id: string | null; currency: string; deleted_at: string | null }) => entry.group_id === groupId && entry.currency === currency && !entry.deleted_at;
      for (const entry of pairwiseBalances(debts(rows.filter(matches), children), payments.filter(matches).map((payment) => ({ from: payment.from_user, to: payment.to_user, amountCents: payment.amount_cents })))) {
        if (viewerId && entry.from !== viewerId && entry.to !== viewerId) continue;
        if (counterparties && !counterparties.includes(entry.from) && !counterparties.includes(entry.to)) continue;
        const lower = entry.from < entry.to ? entry.from : entry.to;
        const upper = entry.from < entry.to ? entry.to : entry.from;
        result.push({ group_id: groupId, currency, low_user: lower, high_user: upper, cents: entry.from === lower ? entry.amountCents : -entry.amountCents });
      }
    }
  }
  return result;
}

/**
 * Computes independent fixture history totals in reader direction.
 * @param viewerId - Reader.
 * @param friendId - Friend.
 * @param client - Fixture snapshot client.
 * @returns Totals across the whole fixture for first-page running balances.
 */
export async function sumPairHistory(viewerId: string, friendId: string, client: PoolClient): Promise<PairHistoryTotal[]> {
  const rows = await expenses.listExpensesBetween(viewerId, friendId, true, client);
  const payments = await settlements.listSettlementsBetween(viewerId, friendId, true, client);
  const children = await expenses.loadExpenseChildren(rows.map((entry) => entry.id), client, false);
  const totals = new Map<string, PairHistoryTotal>();
  /** Accumulates one fixture movement. */
  const accumulate = (groupId: string | null, currency: string, cents: number) => {
    const scopeKey = `${groupId ?? ""}|${currency}`;
    const previous = totals.get(scopeKey)?.cents ?? 0;
    totals.set(scopeKey, { group_id: groupId, currency, cents: previous + cents });
  };
  for (const expense of rows.filter((entry) => !entry.deleted_at)) {
    for (const entry of debts([expense], children)) {
      if (entry.from === viewerId && entry.to === friendId) accumulate(expense.group_id, expense.currency, -entry.amountCents);
      if (entry.to === viewerId && entry.from === friendId) accumulate(expense.group_id, expense.currency, entry.amountCents);
    }
  }
  for (const payment of payments.filter((entry) => !entry.deleted_at)) accumulate(payment.group_id, payment.currency, payment.from_user === viewerId ? payment.amount_cents : -payment.amount_cents);
  return [...totals.values()].filter((entry) => entry.cents !== 0);
}

/**
 * Selects meaningful fixture expense movements in statement order.
 * @param viewerId - Reader.
 * @param friendId - Friend.
 * @param before - Previous position.
 * @param limit - Page capacity.
 * @param client - Fixture snapshot client.
 * @returns The fixture page.
 */
export async function listPairMovementPage(viewerId: string, friendId: string, before: import("@/server/expense/domain/ledgerOrder").LedgerLineKey | null, limit: number, client: PoolClient) {
  const rows = await expenses.listExpensesBetween(viewerId, friendId, true, client);
  const children = await expenses.loadExpenseChildren(rows.map((entry) => entry.id), client, false);
  /** Resolves the fixture's exact ordering key. */
  const lineKey = (entry: expenses.ListedExpenseRow) => ({ day: entry.expense_date, at: entry.created_at_exact, rank: LEDGER_LINE_RANK.expense, id: entry.id });
  return rows.filter((entry) => debts([entry], children).some((debt) => (debt.from === viewerId && debt.to === friendId) || (debt.to === viewerId && debt.from === friendId)))
    .filter((entry) => !before || compareLedgerLineKeys(lineKey(entry), before) < 0)
    .sort((first, second) => compareLedgerLineKeys(lineKey(second), lineKey(first))).slice(0, limit);
}

/**
 * Pages fixture payments in the same total ordering as the indexed SQL.
 * @param viewerId - Reader.
 * @param friendId - Friend.
 * @param before - Previous position.
 * @param limit - Page capacity.
 * @param client - Snapshot client.
 * @returns The fixture payment page.
 */
export async function listFixtureSettlementPage(viewerId: string, friendId: string, before: import("@/server/expense/domain/ledgerOrder").LedgerLineKey | null, limit: number, client?: PoolClient) {
  const rows = await settlements.listSettlementsBetween(viewerId, friendId, true, client);
  /** Resolves one payment's exact ordering key. */
  const lineKey = (entry: settlements.ListedSettlementRow) => ({ day: entry.created_at_exact.slice(0, 10), at: entry.created_at_exact, rank: entry.method === OFFSET_SETTLEMENT_METHOD ? LEDGER_LINE_RANK.offset : LEDGER_LINE_RANK.payment, id: entry.id });
  return rows.filter((entry) => !before || compareLedgerLineKeys(lineKey(entry), before) < 0)
    .sort((first, second) => compareLedgerLineKeys(lineKey(second), lineKey(first))).slice(0, limit);
}
