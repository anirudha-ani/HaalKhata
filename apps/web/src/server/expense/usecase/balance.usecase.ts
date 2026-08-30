/** Balance business logic: builds group/user ledgers from repos and applies the domain balance math. */

import type { PoolClient } from "pg";

import {
  listExpensesBetween,
  listExpensesByGroup,
  listExpensesInvolvingUser,
  listOneOffExpensesBetween,
  loadExpenseChildren,
  type ExpenseChildren,
  type ExpenseRow,
} from "@/server/expense/repo/expenses.repo";
import {
  listOneOffSettlementsBetween,
  listSettlementsBetween,
  listSettlementsByGroup,
  listSettlementsInvolvingUser,
  type SettlementRow,
} from "@/server/expense/repo/settlements.repo";
import {
  findGroupById,
  isMember,
  listGroupsByUser,
  listMembers,
} from "@/server/group/repo/groups.repo";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import {
  expenseDebts,
  netBalances,
  pairwiseBalances,
  simplifyDebts,
  type LedgerEntry,
} from "../domain/balances";
import { type ScopeDebt } from "../domain/settlementAllocation";
import { listFriendIds } from "@/server/social/repo/friendships.repo";
import { denied, notFound } from "@/server/common/errors";
import { toPublicUser } from "@/server/auth/usecase/user.mapper";

/**
 * Cents per ISO 4217 code. A balance between two people is one number per
 * currency and never one number overall: nothing here converts, so a dollar
 * owed and a euro owed stay two facts. Zero buckets are omitted.
 */
export type CurrencyCents = Map<string, number>;

/**
 * Adds cents into one currency's bucket, dropping the bucket when it lands on
 * zero so "nothing between you" is expressed by absence.
 *
 * @param buckets - The map to update.
 * @param currency - ISO 4217 code.
 * @param cents - Signed cents to add.
 */
function addCents(buckets: CurrencyCents, currency: string, cents: number): void {
  const total = (buckets.get(currency) ?? 0) + cents;
  if (total === 0) buckets.delete(currency);
  else buckets.set(currency, total);
}

/**
 * Lists the buckets as proto CurrencyAmount init shapes, the default currency
 * first and the rest alphabetically, so every client renders them in the
 * same order.
 *
 * @param buckets - Cents per currency.
 * @param defaultCurrency - The caller's default currency, listed first.
 * @returns The non-zero buckets.
 */
export function currencyAmounts(
  buckets: CurrencyCents,
  defaultCurrency: string,
): { currency: string; cents: number }[] {
  return [...buckets.entries()]
    .filter(([, cents]) => cents !== 0)
    .sort(([first], [second]) =>
      first === defaultCurrency ? -1 : second === defaultCurrency ? 1 : first.localeCompare(second),
    )
    .map(([currency, cents]) => ({ currency, cents }));
}

/**
 * Builds one pairwise ledger per currency from mixed rows. Every expense and
 * settlement carries its own currency, and a ledger only makes sense within
 * one: netting a euro expense against a dollar payment would be netting
 * nothing against nothing.
 *
 * @param expenses - Expense rows of any currency.
 * @param children - Their payer/split rows.
 * @param settlements - Settlement rows of any currency.
 * @returns Normalized pairwise entries per currency.
 */
function ledgersByCurrency(
  expenses: ExpenseRow[],
  children: ExpenseChildren,
  settlements: SettlementRow[],
): Map<string, LedgerEntry[]> {
  const currencies = new Set([
    ...expenses.map((expense) => expense.currency),
    ...settlements.map((settlement) => settlement.currency),
  ]);
  const ledgers = new Map<string, LedgerEntry[]>();
  for (const currency of currencies) {
    ledgers.set(
      currency,
      pairwiseBalances(
        debtsFromExpenses(
          expenses.filter((expense) => expense.currency === currency),
          children,
        ),
        settlements
          .filter((settlement) => settlement.currency === currency)
          .map((settlement) => ({
            from: settlement.from_user,
            to: settlement.to_user,
            amountCents: settlement.amount_cents,
          })),
      ),
    );
  }
  return ledgers;
}

/**
 * Converts a batch of expenses (with their loaded children) into directed
 * pairwise debts, one call to {@link expenseDebts} per expense.
 *
 * @param expenses - Expense rows to convert.
 * @param children - Their payer/split child rows, from `loadExpenseChildren`.
 * @returns Directed debts across all the expenses, unmerged.
 */
function debtsFromExpenses(expenses: ExpenseRow[], children: ExpenseChildren): LedgerEntry[] {
  return expenses.flatMap((expense) =>
    expenseDebts(
      (children.payers.get(expense.id) ?? []).map((payer) => ({
        userId: payer.user_id,
        amountCents: payer.amount_cents,
      })),
      (children.splits.get(expense.id) ?? []).map((split) => ({
        userId: split.user_id,
        amountCents: split.owed_cents,
      })),
    ),
  );
}

/**
 * Builds a group's pairwise ledger: per-expense debts netted against the
 * group's recorded settlements.
 *
 * @param groupId - Id of the group whose ledger is built.
 * @returns Normalized pairwise entries (one per user pair, amount > 0).
 */
async function groupLedger(groupId: string, client?: PoolClient): Promise<LedgerEntry[]> {
  const expenses = await listExpensesByGroup(groupId, client);
  const children = await loadExpenseChildren(expenses.map((expense) => expense.id), client);
  const settlements = (await listSettlementsByGroup(groupId, client)).map((settlement) => ({
    from: settlement.from_user,
    to: settlement.to_user,
    amountCents: settlement.amount_cents,
  }));
  return pairwiseBalances(debtsFromExpenses(expenses, children), settlements);
}

/**
 * The debt graph a group actually routes payments along: the raw pairwise
 * ledger, or — when the group simplifies debts — the min-cash-flow edges over
 * the same nets. Every question of the form "who owes whom in this group"
 * must read this one graph, guards and pages alike: the moment a page
 * proposes a payment the guards reject (or the reverse), the same debt has
 * two routings, and a debt with two live routings can be paid down twice.
 *
 * @param ledger - The group's normalized pairwise entries.
 * @param simplify - The group's persisted simplify-debts mode.
 * @returns The entries payments are validated and displayed against.
 */
function routeDebts(ledger: LedgerEntry[], simplify: boolean): LedgerEntry[] {
  return simplify ? simplifyDebts(netBalances(ledger)) : ledger;
}

/**
 * Computes a group's balances three ways: per-member net positions (every
 * member listed, even at zero), the raw pairwise debts, and the simplified
 * min-cash-flow payment plan.
 *
 * @param userId - Authenticated caller; must be a group member.
 * @param groupId - Id of the group whose balances are computed.
 * @returns Net positions, pairwise debts, and simplified payments, as proto init shapes.
 * @throws UsecaseError (permission_denied) if the caller is not a member.
 */
export async function getGroupBalances(userId: string, groupId: string) {
  if (!(await isMember(groupId, userId))) denied("you are not a member of this group");
  const pairwise = await groupLedger(groupId);
  const netByUser = netBalances(pairwise);
  // Every member appears, including settled-up ones.
  for (const member of await listMembers(groupId)) {
    if (!netByUser.has(member.id)) netByUser.set(member.id, 0);
  }
  return {
    nets: [...netByUser.entries()]
      .sort(([firstUserId], [secondUserId]) => firstUserId.localeCompare(secondUserId))
      .map(([memberId, netCents]) => ({ userId: memberId, netCents })),
    debts: pairwise.map((debt) => ({
      fromUserId: debt.from,
      toUserId: debt.to,
      amountCents: debt.amountCents,
    })),
    simplified: simplifyDebts(netByUser).map((debt) => ({
      fromUserId: debt.from,
      toUserId: debt.to,
      amountCents: debt.amountCents,
    })),
  };
}

/**
 * A user's net position inside one group.
 *
 * @param userId - User whose position is computed.
 * @param groupId - Group to compute the position in.
 * @param client - Optional transaction client holding the group-ledger lock.
 * @returns Net cents; > 0 ⇒ the user is owed money in this group.
 */
export async function userNetInGroup(
  userId: string,
  groupId: string,
  client?: PoolClient,
): Promise<number> {
  return netBalances(await groupLedger(groupId, client)).get(userId) ?? 0;
}

/**
 * Batched: each group's net position for a specific user, in one pass per
 * group. Used by listGroups to avoid the N+1 of calling userNetInGroup per
 * group.
 *
 * @param userId - User whose positions are computed.
 * @param groupIds - Groups to compute the position in.
 * @returns Map of group id → net cents for that user (> 0 ⇒ owed money).
 */
export async function userNetInGroups(
  userId: string,
  groupIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  await Promise.all(
    groupIds.map(async (groupId) => {
      result.set(groupId, await userNetInGroup(userId, groupId));
    }),
  );
  return result;
}

/**
 * How much `debtorId` currently owes `creditorId` inside one group, along the
 * route the group's mode prescribes — the pairwise debt, or the simplified
 * edge when the group simplifies. Returns a non-negative number of cents (0
 * when nothing is owed or the direction is reversed). Used by
 * recordSettlement to refuse over-settling a group scope; the cross-scope
 * equivalent is {@link owedByScope}.
 *
 * @param debtorId - User who would be paying.
 * @param creditorId - User who would be receiving.
 * @param groupId - Group whose ledger is consulted.
 * @param client - Settlement transaction client; omitted for ordinary reads.
 * @returns Non-negative cents the debtor owes the creditor in that group.
 */
export async function amountOwed(
  debtorId: string,
  creditorId: string,
  groupId: string,
  client?: PoolClient,
): Promise<number> {
  const group = await findGroupById(groupId, client);
  return owedInEntries(
    routeDebts(await groupLedger(groupId, client), group?.simplify_debts ?? false),
    debtorId,
    creditorId,
  );
}

/**
 * The user's net position against every counterparty, scope by scope: the
 * sum, over each scope the pair shares, of that scope's balance between them
 * — routed the way that scope routes it. Groups that simplify debts
 * contribute their simplified edge (which can point at a member the user
 * never dealt with directly, and contribute nothing against someone their
 * history says they owe — that debt was rerouted); every other scope
 * contributes its pairwise net.
 *
 * This is the number the dashboard, friends list and reminders all show, and
 * it has to be built from the same routed scopes the settlement guards check
 * — a "you owe" on the dashboard that no payment is allowed to pay down is a
 * contradiction on screen.
 *
 * The un-simplified scopes are not computed one scope at a time: pairwise
 * netting is linear, so their sum equals one pass over everything except the
 * simplified groups' rows. Only simplified groups need their own ledger read,
 * because simplification is a whole-group computation, not a pair one.
 *
 * Per currency throughout: a group's rows are all in its currency, a one-off
 * expense carries its own, and a position against one person is one bucket
 * per currency, never a sum across them.
 *
 * @param userId - User whose positions are computed.
 * @returns Map of counterparty id → cents per currency (> 0 ⇒ they owe the
 *   user); counterparties with nothing outstanding in any currency are omitted.
 */
async function pairNetsForUser(userId: string): Promise<Map<string, CurrencyCents>> {
  const groups = await listGroupsByUser(userId);
  const simplifiedGroupIds = new Set(
    groups.filter((group) => group.simplify_debts).map((group) => group.id),
  );

  const expenses = (await listExpensesInvolvingUser(userId)).filter(
    (expense) => !simplifiedGroupIds.has(expense.group_id ?? ""),
  );
  const children = await loadExpenseChildren(expenses.map((expense) => expense.id));
  const settlements = (await listSettlementsInvolvingUser(userId)).filter(
    (settlement) => !simplifiedGroupIds.has(settlement.group_id ?? ""),
  );

  const netByCounterparty = new Map<string, CurrencyCents>(); // > 0 ⇒ they owe the user
  const accumulate = (currency: string, entry: LedgerEntry) => {
    const counterpartyId =
      entry.from === userId ? entry.to : entry.to === userId ? entry.from : null;
    if (counterpartyId === null) return;
    const buckets = netByCounterparty.get(counterpartyId) ?? new Map<string, number>();
    addCents(buckets, currency, entry.from === userId ? -entry.amountCents : entry.amountCents);
    netByCounterparty.set(counterpartyId, buckets);
  };
  for (const [currency, ledger] of ledgersByCurrency(expenses, children, settlements)) {
    for (const entry of ledger) accumulate(currency, entry);
  }
  for (const group of groups) {
    if (!group.simplify_debts) continue;
    for (const edge of routeDebts(await groupLedger(group.id), true)) {
      accumulate(group.currency, edge);
    }
  }

  // A rerouted debt and a pairwise one can cancel exactly; a zero position is
  // "nothing between you", which is expressed by absence.
  for (const [counterpartyId, buckets] of [...netByCounterparty.entries()]) {
    if (buckets.size === 0) netByCounterparty.delete(counterpartyId);
  }
  return netByCounterparty;
}

/**
 * Reads what one user owes another out of a normalized pairwise ledger.
 *
 * @param entries - Pairwise entries from {@link pairwiseBalances}.
 * @param payerId - The user who would be paying.
 * @param creditorId - The user who would be receiving.
 * @returns Cents payer owes creditor in these entries; 0 when nothing or reversed.
 */
function owedInEntries(entries: LedgerEntry[], payerId: string, creditorId: string): number {
  for (const entry of entries) {
    if (entry.from === payerId && entry.to === creditorId) return entry.amountCents;
  }
  return 0;
}

/**
 * The viewer's net in the pair's one-off scope alone, per currency: one-off
 * expenses between the two, netted against one-off settlement rows, group
 * scopes excluded entirely. The one-off counterpart of {@link userNetInGroup}.
 *
 * @param userId - The viewer.
 * @param otherUserId - The counterparty.
 * @returns Cents per currency; > 0 ⇒ the other user owes the viewer one-off.
 */
export async function oneOffNetsBetween(
  userId: string,
  otherUserId: string,
): Promise<CurrencyCents> {
  const expenses = await listOneOffExpensesBetween(userId, otherUserId);
  const children = await loadExpenseChildren(expenses.map((expense) => expense.id));
  const settlements = await listOneOffSettlementsBetween(userId, otherUserId);
  const nets: CurrencyCents = new Map();
  for (const [currency, entries] of ledgersByCurrency(expenses, children, settlements)) {
    addCents(
      nets,
      currency,
      owedInEntries(entries, otherUserId, userId) - owedInEntries(entries, userId, otherUserId),
    );
  }
  return nets;
}

/**
 * Where a payer's debt to a creditor actually lives, scope by scope.
 *
 * Each scope — every shared group, plus the pair's one-off ledger — is
 * computed independently from its own expenses and its own settlement rows,
 * exactly the way that scope's balance page computes it. That identity is
 * the point: a settlement recorded against a scope listed here moves the
 * number the payer was looking at when they decided to pay.
 *
 * Scopes where the payer is owed (direction reversed) are not listed; a
 * payment cannot pay down a debt that points the other way. Such scopes make
 * the pair's global net smaller than the sum returned here, which is why
 * over-settle guards must check against this sum, never the net.
 *
 * Every scope is one currency: a group's, or — for the one-off ledger, which
 * holds a slate per currency — one entry per currency owed.
 *
 * @param payerId - The user paying.
 * @param creditorId - The user being paid.
 * @param client - Settlement transaction client; omitted for ordinary reads.
 * @returns Scopes with a positive payer→creditor debt; order is not meaningful.
 */
export async function owedByScope(
  payerId: string,
  creditorId: string,
  client?: PoolClient,
): Promise<ScopeDebt[]> {
  const scopes: ScopeDebt[] = [];

  const oneOffExpenses = await listOneOffExpensesBetween(payerId, creditorId, client);
  const children = await loadExpenseChildren(
    oneOffExpenses.map((expense) => expense.id),
    client,
  );
  const oneOffSettlements = await listOneOffSettlementsBetween(payerId, creditorId, client);
  for (const [currency, entries] of ledgersByCurrency(
    oneOffExpenses,
    children,
    oneOffSettlements,
  )) {
    const oneOffCents = owedInEntries(entries, payerId, creditorId);
    if (oneOffCents > 0) scopes.push({ groupId: null, currency, owedCents: oneOffCents });
  }

  const payerGroupIds = new Set(
    (await listGroupsByUser(payerId, client)).map((group) => group.id),
  );
  for (const group of await listGroupsByUser(creditorId, client)) {
    if (!payerGroupIds.has(group.id)) continue;
    const owedCents = owedInEntries(
      routeDebts(await groupLedger(group.id, client), group.simplify_debts),
      payerId,
      creditorId,
    );
    if (owedCents > 0) scopes.push({ groupId: group.id, currency: group.currency, owedCents });
  }
  return scopes;
}

/**
 * The largest single bucket a position holds, for ordering counterparties by
 * how much attention they need. Across currencies the magnitudes are not
 * comparable, so this is a display order and nothing more.
 *
 * @param buckets - Cents per currency.
 * @returns The largest absolute amount in any one currency.
 */
function largestBucket(buckets: CurrencyCents): number {
  return Math.max(0, ...[...buckets.values()].map((cents) => Math.abs(cents)));
}

/**
 * The caller's overall position: totals owed by them and to them, per
 * currency, and a per-counterparty breakdown sorted by size. The legacy
 * scalar totals and `netCents` report the caller's default currency alone.
 *
 * @param userId - Authenticated caller.
 * @returns Totals per currency plus one entry per counterparty with their
 *   balances per currency (positive ⇒ they owe the caller).
 * @throws UsecaseError (not_found) if a counterparty's user row is missing.
 */
export async function getOverallBalances(userId: string) {
  const perCounterparty = await pairNetsForUser(userId);
  const defaultCurrency = (await findUserById(userId))?.default_currency || "USD";
  const totals = new Map<string, { youOweCents: number; owedToYouCents: number }>();
  for (const buckets of perCounterparty.values()) {
    for (const [currency, netCents] of buckets) {
      const total = totals.get(currency) ?? { youOweCents: 0, owedToYouCents: 0 };
      if (netCents < 0) total.youOweCents += -netCents;
      else total.owedToYouCents += netCents;
      totals.set(currency, total);
    }
  }
  const users = new Map(
    (await findUsersByIds([...perCounterparty.keys()])).map((user) => [user.id, user]),
  );
  const defaultTotals = totals.get(defaultCurrency) ?? { youOweCents: 0, owedToYouCents: 0 };
  return {
    youOweCents: defaultTotals.youOweCents,
    owedToYouCents: defaultTotals.owedToYouCents,
    totals: [...totals.entries()]
      .sort(([first], [second]) =>
        first === defaultCurrency
          ? -1
          : second === defaultCurrency
            ? 1
            : first.localeCompare(second),
      )
      .map(([currency, total]) => ({ currency, ...total })),
    counterparties: [...perCounterparty.entries()]
      .sort(
        ([, firstBuckets], [, secondBuckets]) =>
          largestBucket(secondBuckets) - largestBucket(firstBuckets),
      )
      .flatMap(([counterpartyId, buckets]) => {
        const user = users.get(counterpartyId);
        if (!user) notFound(`unknown user ${counterpartyId}`);
        return [
          {
            user: toPublicUser(user),
            netCents: buckets.get(defaultCurrency) ?? 0,
            balances: currencyAmounts(buckets, defaultCurrency),
          },
        ];
      }),
  };
}

/**
 * Net position between the caller and one other user, per currency.
 *
 * @param userId - Authenticated caller.
 * @param otherUserId - The counterparty to measure against.
 * @returns Cents per currency; > 0 ⇒ the other user owes the caller.
 */
export async function netWithUser(userId: string, otherUserId: string): Promise<CurrencyCents> {
  return (await pairNetsForUser(userId)).get(otherUserId) ?? new Map();
}

/**
 * How much one expense moved the balance between two people.
 *
 * Reuses `expenseDebts` — the same per-expense attribution the balances
 * themselves are built from — so the ledger's running total lands on exactly
 * the figure {@link getOverallBalances} reports, instead of a second,
 * plausible-but-different pairwise reckoning.
 *
 * @param debts - Pairwise debts produced by `expenseDebts` for one expense.
 * @param userId - The viewer.
 * @param otherUserId - The friend whose ledger this is.
 * @returns Cents; > 0 ⇒ this expense left the friend owing the viewer more.
 */
function pairDelta(debts: LedgerEntry[], userId: string, otherUserId: string): number {
  let delta = 0;
  for (const debt of debts) {
    if (debt.from === otherUserId && debt.to === userId) delta += debt.amountCents;
    if (debt.from === userId && debt.to === otherUserId) delta -= debt.amountCents;
  }
  return delta;
}

/**
 * The full shared history with one person: every expense you both appear on
 * (group ones included, the way Splitwise totals a friendship) and every
 * settlement either way, merged oldest-to-newest with a running balance, then
 * returned newest-first for reading.
 *
 * Lines that moved nothing between the two of you — a group expense you were
 * both on but which netted to zero across the pair — are dropped, because a
 * statement row that changes no balance is noise. A deleted expense is the
 * one exception: it stays as a line with a zero change, marked deleted, so a
 * payment made against it before it was deleted keeps the row that explains
 * why the balance now leans the other way.
 *
 * Everything runs per currency: each line carries its own, the running
 * balance continues that currency's column, and the headline is one net per
 * currency — never a sum across them.
 *
 * @param userId - Authenticated caller.
 * @param friendId - The other person.
 * @returns The friend, the nets per currency (> 0 ⇒ they owe you), the
 *   entries newest-first, and the per-scope breakdown.
 * @throws UsecaseError (not_found) when the person is missing or has no
 *   friendship, mutual group, or shared ledger history with the caller.
 */
export async function getFriendLedger(userId: string, friendId: string) {
  const friend = await findUserById(friendId);
  const defaultCurrency = (await findUserById(userId))?.default_currency || "USD";

  const expenses = await listExpensesBetween(userId, friendId, true);
  const children = await loadExpenseChildren(expenses.map((expense) => expense.id));
  const settlements = await listSettlementsBetween(userId, friendId, true);

  const groupNames = new Map<string, string>();
  for (const groupId of new Set(
    expenses.flatMap((expense) => (expense.group_id ? [expense.group_id] : [])),
  )) {
    const group = await findGroupById(groupId);
    if (group) groupNames.set(groupId, group.name);
  }

  type Line = {
    kind: string;
    id: string;
    date: string;
    description: string;
    groupId: string;
    groupName: string;
    currency: string;
    totalCents: number;
    deltaCents: number;
    sortKey: string;
    createdAt: string;
    deleted: boolean;
    recordedByName: string;
  };
  const lines: Line[] = [];

  for (const expense of expenses) {
    const debts = expenseDebts(
      (children.payers.get(expense.id) ?? []).map((payer) => ({
        userId: payer.user_id,
        amountCents: payer.amount_cents,
      })),
      (children.splits.get(expense.id) ?? []).map((split) => ({
        userId: split.user_id,
        amountCents: split.owed_cents,
      })),
    );
    // What the line would move — or did move, until it was deleted. A row
    // that never touched this pair is noise either way and stays out.
    const liveDeltaCents = pairDelta(debts, userId, friendId);
    if (liveDeltaCents === 0) continue;
    const deleted = expense.deleted_at !== null;
    lines.push({
      kind: "expense",
      id: expense.id,
      date: expense.expense_date,
      description: expense.description,
      groupId: expense.group_id ?? "",
      groupName: expense.group_id ? (groupNames.get(expense.group_id) ?? "") : "",
      currency: expense.currency,
      totalCents: expense.amount_cents,
      // Deleted means owed-to-zero: the line stays, the movement does not.
      deltaCents: deleted ? 0 : liveDeltaCents,
      sortKey: `${expense.expense_date}T${expense.created_at}`,
      // An expense's date is the calendar day the user picked, not a moment;
      // there is nothing to convert, so no timestamp rides along.
      createdAt: "",
      deleted,
      recordedByName: "",
    });
  }

  for (const settlement of settlements) {
    // You paying them shrinks your debt, so it moves the balance in your
    // favour exactly as an expense they owed you on would.
    const paidByYou = settlement.from_user === userId;
    // A removed payment stays as a line with no movement, so the debt that
    // came back when it was removed still has the row explaining it.
    const deleted = settlement.deleted_at !== null;
    lines.push({
      kind: "settlement",
      id: settlement.id,
      // The UTC day, kept as a fallback; the timestamp below is what the
      // client renders, in the viewer's own timezone.
      date: settlement.created_at.slice(0, 10),
      description: paidByYou ? "You paid" : `${friend?.name ?? ""} paid you`,
      groupId: settlement.group_id ?? "",
      groupName: settlement.group_id ? (groupNames.get(settlement.group_id) ?? "") : "",
      currency: settlement.currency,
      totalCents: settlement.amount_cents,
      deltaCents: deleted ? 0 : paidByYou ? settlement.amount_cents : -settlement.amount_cents,
      sortKey: `${settlement.created_at.slice(0, 10)}T${settlement.created_at}`,
      createdAt: settlement.created_at,
      deleted,
      // A payment is a claim one of the two people typed in; the statement
      // says which, so "You paid" recorded by them reads differently from
      // "You paid" recorded by you.
      recordedByName: settlement.recorded_by === userId ? "you" : (friend?.name ?? ""),
    });
  }

  lines.sort((first, second) => first.sortKey.localeCompare(second.sortKey));
  // One running column per currency: a euro line continues the euro balance
  // and leaves the dollar one where it was.
  const runningByCurrency = new Map<string, number>();
  const entries = lines.map((line) => {
    const runningCents = (runningByCurrency.get(line.currency) ?? 0) + line.deltaCents;
    runningByCurrency.set(line.currency, runningCents);
    return {
      kind: line.kind,
      id: line.id,
      date: line.date,
      description: line.description,
      groupId: line.groupId,
      groupName: line.groupName,
      currency: line.currency,
      totalCents: line.totalCents,
      deltaCents: line.deltaCents,
      balanceAfterCents: runningCents,
      createdAt: line.createdAt,
      deleted: line.deleted,
      recordedByName: line.recordedByName,
    };
  });
  entries.reverse();

  // The pair's history per scope and currency: `<groupId>|<currency>`, with
  // the one-off slate keyed on "" — one entry per currency it holds.
  const scopeKey = (groupId: string, currency: string) => `${groupId}|${currency}`;
  const netByScope = new Map<string, number>();
  for (const line of lines) {
    const scope = scopeKey(line.groupId, line.currency);
    netByScope.set(scope, (netByScope.get(scope) ?? 0) + line.deltaCents);
  }

  // Relationship context, not balance context: which groups both belong to
  // (settled ones included — "where do I know them from" is not "where does
  // money move"), and whether an explicit friendship exists.
  const friendGroupIds = new Set((await listGroupsByUser(friendId)).map((group) => group.id));
  const mutualGroupRows = (await listGroupsByUser(userId)).filter((group) =>
    friendGroupIds.has(group.id),
  );
  const isFriend = (await listFriendIds(userId)).includes(friendId);
  if (!friend || (!isFriend && mutualGroupRows.length === 0 && entries.length === 0)) {
    // Identical for an unknown id and an existing unrelated account: callers
    // cannot use this endpoint as a user-existence oracle.
    notFound("friend ledger not found");
  }

  // Per-scope balances, each routed the way its scope routes debt. A group
  // that simplifies debts contributes the simplified edge between the pair —
  // possibly zero while their shared history is not (the debt was rerouted
  // through others), or nonzero between two people who never shared an
  // expense. Rows where either number is nonzero are kept, so a rerouted
  // balance always has a line explaining where it went, and the headline is
  // the sum of these rows — the same routed number the dashboard shows and
  // the settlement guards enforce, not the raw history total.
  const groupBalances: {
    groupId: string;
    groupName: string;
    currency: string;
    netCents: number;
    simplified: boolean;
  }[] = [];
  for (const group of mutualGroupRows) {
    if (!group.simplify_debts) continue;
    const edges = simplifyDebts(netBalances(await groupLedger(group.id)));
    const routedCents =
      owedInEntries(edges, friendId, userId) - owedInEntries(edges, userId, friendId);
    const historyCents = netByScope.get(scopeKey(group.id, group.currency)) ?? 0;
    netByScope.delete(scopeKey(group.id, group.currency));
    if (routedCents !== 0 || historyCents !== 0) {
      groupBalances.push({
        groupId: group.id,
        groupName: group.name,
        currency: group.currency,
        netCents: routedCents,
        simplified: true,
      });
    }
  }
  for (const [scope, historyCents] of netByScope) {
    if (historyCents === 0) continue;
    const [groupId, currency] = scope.split("|");
    groupBalances.push({
      groupId,
      groupName: groupId ? (groupNames.get(groupId) ?? "") : "",
      currency,
      netCents: historyCents,
      simplified: false,
    });
  }
  // The headline: one net per currency, each the sum of that currency's
  // scopes — the same routed numbers the dashboard shows and the settlement
  // guards enforce.
  const nets: CurrencyCents = new Map();
  for (const scope of groupBalances) addCents(nets, scope.currency, scope.netCents);

  return {
    friend: toPublicUser(friend),
    netCents: nets.get(defaultCurrency) ?? 0,
    currency: defaultCurrency,
    nets: currencyAmounts(nets, defaultCurrency),
    entries,
    groupBalances,
    isFriend,
    mutualGroups: mutualGroupRows.map((group) => ({
      groupId: group.id,
      groupName: group.name,
      groupType: group.type,
    })),
  };
}
