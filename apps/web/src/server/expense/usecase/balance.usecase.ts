/** Balance business logic: builds group/user ledgers from repos and applies the domain balance math. */

import type { PoolClient } from "pg";

import {
  listExpensesBetween,
  listExpensesByGroups,
  listExpensesInvolvingUser,
  listOneOffExpensesBetween,
  listOneOffExpensesWithAnyOf,
  loadExpenseChildren,
  type ExpenseChildren,
  type ExpenseRow,
} from "@/server/expense/repo/expenses.repo";
import {
  listOneOffSettlementsBetween,
  listOneOffSettlementsWithAnyOf,
  listSettlementsBetween,
  listSettlementsByGroups,
  listSettlementsInvolvingUser,
  type SettlementRow,
} from "@/server/expense/repo/settlements.repo";
import {
  findGroupById,
  findGroupsByIds,
  isMember,
  listGroupsByUser,
  listMembers,
  type GroupRow,
} from "@/server/group/repo/groups.repo";
import { GROUP_STATUS_STORAGE } from "@/server/group/group.constants";
import { GroupStatus } from "@haalkhata/protogen/group/v1/group_pb";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import {
  expenseDebts,
  netBalances,
  pairwiseBalances,
  simplifyDebts,
  type LedgerEntry,
} from "../domain/balances";
import {
  positionDigest,
  type DirectedScopeDebt,
  type ScopeDebt,
} from "../domain/settlementAllocation";
import { listFriendIds } from "@/server/social/repo/friendships.repo";
import { hasUnsettledGroupBalances, sumUserNetByGroup } from "@/server/expense/repo/ledger.repo";
import { snapshot } from "@/server/common/db/db";
import { denied, notFound } from "@/server/common/errors";
import { toInt32Cents } from "@/server/common/money/money";
import { toPublicUser } from "@/server/auth/usecase/identity/user.mapper";
import { listPayeeMethods } from "@/server/payment/usecase/paymentMethod.usecase";
import {
  LEDGER_DISPLAY_LIMIT,
  OFFSET_SETTLEMENT_METHOD,
  formerMemberRefusal,
} from "@/server/expense/expense.constants";

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
 * Comparator putting the caller's default currency first and the rest
 * alphabetically — the one order every list of currency buckets uses, so
 * clients always render them the same way.
 *
 * @param defaultCurrency - The currency to list first.
 * @returns A comparator over ISO 4217 codes.
 */
function defaultCurrencyFirst(defaultCurrency: string) {
  return (first: string, second: string): number =>
    first === defaultCurrency ? -1 : second === defaultCurrency ? 1 : first.localeCompare(second);
}

/**
 * Lists the buckets as proto CurrencyAmount init shapes, ordered by
 * {@link defaultCurrencyFirst}.
 *
 * @param buckets - Cents per currency.
 * @param defaultCurrency - The caller's default currency, listed first.
 * @returns The non-zero buckets.
 */
export function currencyAmounts(
  buckets: CurrencyCents,
  defaultCurrency: string,
): { currency: string; cents: number }[] {
  const compareCurrency = defaultCurrencyFirst(defaultCurrency);
  return [...buckets.entries()]
    .filter(([, cents]) => cents !== 0)
    .sort(([first], [second]) => compareCurrency(first, second))
    .map(([currency, cents]) => ({ currency, cents: toInt32Cents(cents, "a balance") }));
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
  return (await groupLedgers([groupId], client)).get(groupId) ?? [];
}

/**
 * Loads multiple group ledgers in a fixed number of queries, without receipt data.
 * @param groupIds - Group scopes to assemble.
 * @param client - Snapshot or locked transaction shared by every statement.
 * @returns One normalized ledger per requested group.
 */
async function groupLedgers(groupIds: readonly string[], client?: PoolClient): Promise<Map<string, LedgerEntry[]>> {
  if (groupIds.length === 0) return new Map();
  const expenses = await listExpensesByGroups(groupIds, client);
  const children = await loadExpenseChildren(expenses.map((expense) => expense.id), client, false);
  const settlements = await listSettlementsByGroups(groupIds, client);
  const expensesByGroup = new Map<string, ExpenseRow[]>();
  const paymentsByGroup = new Map<string, LedgerEntry[]>();
  for (const expense of expenses) {
    if (!expense.group_id) continue;
    const rows = expensesByGroup.get(expense.group_id) ?? [];
    rows.push(expense);
    expensesByGroup.set(expense.group_id, rows);
  }
  for (const settlement of settlements) {
    if (!settlement.group_id) continue;
    const rows = paymentsByGroup.get(settlement.group_id) ?? [];
    rows.push({ from: settlement.from_user, to: settlement.to_user, amountCents: settlement.amount_cents });
    paymentsByGroup.set(settlement.group_id, rows);
  }
  return new Map(groupIds.map((groupId) => [groupId, pairwiseBalances(
    debtsFromExpenses(expensesByGroup.get(groupId) ?? [], children), paymentsByGroup.get(groupId) ?? [],
  )]));
}

/**
 * Whether a group's settled history must stay out of payable balance surfaces.
 * @param group - Persisted lifecycle metadata.
 * @returns True for archived and deleted group scopes.
 */
function groupIsInactive(group: GroupRow): boolean {
  return group.status === GROUP_STATUS_STORAGE[GroupStatus.ARCHIVED]
    || group.status === GROUP_STATUS_STORAGE[GroupStatus.DELETED];
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
  // One instant for the whole group: its expenses, their shares and its
  // payments are separate statements, and a balance assembled across a
  // commit is one the group never had.
  const { pairwise, members } = await snapshot(async (client) => ({
    pairwise: await groupLedger(groupId, client),
    members: await listMembers(groupId, client),
  }));
  const netByUser = netBalances(pairwise);
  // Every member appears, including settled-up ones.
  for (const member of members) {
    if (!netByUser.has(member.id)) netByUser.set(member.id, 0);
  }
  // Aggregates, checked against the wire: two valid rows can already sum
  // past int32, and the encoder's own failure would be an opaque internal
  // error.
  return {
    nets: [...netByUser.entries()]
      .sort(([firstUserId], [secondUserId]) => firstUserId.localeCompare(secondUserId))
      .map(([memberId, netCents]) => ({
        userId: memberId,
        netCents: toInt32Cents(netCents, "a member's balance in this group"),
      })),
    debts: pairwise.map((debt) => ({
      fromUserId: debt.from,
      toUserId: debt.to,
      amountCents: toInt32Cents(debt.amountCents, "a debt in this group"),
    })),
    simplified: simplifyDebts(netByUser).map((debt) => ({
      fromUserId: debt.from,
      toUserId: debt.to,
      amountCents: toInt32Cents(debt.amountCents, "a debt in this group"),
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
 * Batched: each group's net position for a specific user, in one database
 * query for every group at once. Nets are routing-independent, so the SQL
 * sum agrees with {@link userNetInGroup}'s ledger walk; what it avoids is
 * loading every group's whole history into the process, one pool connection
 * per group, to answer a number Postgres can add up itself.
 *
 * @param userId - User whose positions are computed.
 * @param groupIds - Groups to compute the position in.
 * @param client - Snapshot or transaction client; omitted, the pool.
 * @returns Map of group id → net cents for that user (> 0 ⇒ owed money);
 *   every requested group is present, at zero when nothing involves them.
 */
export async function userNetInGroups(
  userId: string,
  groupIds: string[],
  client?: PoolClient,
): Promise<Map<string, number>> {
  const nets = await sumUserNetByGroup(userId, groupIds, client);
  return new Map(groupIds.map((groupId) => [groupId, nets.get(groupId) ?? 0]));
}

/**
 * Checks every participant's net in every currency before archiving. Empty
 * ledgers and cancelling debt cycles are settled; currencies never offset
 * each other, including historical rows predating currency constraints.
 * Postgres aggregates the stored nets without loading expense histories,
 * receipt items or pairwise graphs into application memory.
 *
 * @param groupId - Group whose full ledger is checked.
 * @param client - Transaction client holding the group-ledger lock.
 * @returns True when no participant has an outstanding balance in any currency.
 */
export async function groupIsSettled(groupId: string, client: PoolClient): Promise<boolean> {
  return !(await hasUnsettledGroupBalances(groupId, client));
}

/**
 * Whether a group's pairwise debts cancel out around a loop: every member's
 * net is zero while pairwise edges remain (A→B→C→A). Money-wise nobody owes
 * anybody, so no edge of the loop is a debt a payment should pay down — a
 * payment along it would leave the payer owed money by the next person
 * round, which is exactly the double-count simplification exists to
 * prevent. Typically left behind by payments recorded while the group
 * simplified debts and then switching the mode off.
 *
 * @param groupId - Group whose ledger is consulted.
 * @param client - Settlement transaction client; omitted for ordinary reads.
 * @returns True when pairwise debts exist but every net is zero.
 */
export async function groupCancelsOut(groupId: string, client?: PoolClient): Promise<boolean> {
  return cancelsOut(await groupLedger(groupId, client));
}

/**
 * The pure half of {@link groupCancelsOut}: pairwise edges remain while
 * every member's net is zero.
 *
 * @param ledger - Normalized pairwise entries.
 * @returns True when entries exist but all nets are zero.
 */
function cancelsOut(ledger: LedgerEntry[]): boolean {
  return (
    ledger.length > 0 && [...netBalances(ledger).values()].every((netCents) => netCents === 0)
  );
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
 * @param client - Snapshot client, so every statement reads the same instant.
 * @returns Map of counterparty id → cents per currency (> 0 ⇒ they owe the
 *   user); counterparties with nothing outstanding in any currency are omitted.
 */
async function pairNetsForUser(
  userId: string,
  client: PoolClient,
): Promise<Map<string, CurrencyCents>> {
  const groups = await listGroupsByUser(userId, client);
  const simplifiedGroupIds = new Set(
    groups.filter((group) => group.simplify_debts).map((group) => group.id),
  );

  const allExpenses = await listExpensesInvolvingUser(userId, false, undefined, client);
  const allSettlements = await listSettlementsInvolvingUser(userId, client);
  // A former member's history can still name groups they no longer list.
  const knownIds = new Set(groups.map((group) => group.id));
  const missingIds = [...new Set([...allExpenses, ...allSettlements].flatMap(
    (entry) => entry.group_id && !knownIds.has(entry.group_id) ? [entry.group_id] : [],
  ))];
  const missingGroups = missingIds.length > 0 ? await findGroupsByIds(missingIds, client) : [];
  const inactiveIds = new Set([...groups, ...missingGroups]
    .filter(groupIsInactive).map((group) => group.id));
  const expenses = allExpenses.filter((expense) => !simplifiedGroupIds.has(expense.group_id ?? "")
    && !inactiveIds.has(expense.group_id ?? ""));
  const children = await loadExpenseChildren(
    expenses.map((expense) => expense.id),
    client,
    false,
  );
  const settlements = allSettlements.filter((settlement) => !simplifiedGroupIds.has(settlement.group_id ?? "")
    && !inactiveIds.has(settlement.group_id ?? ""));

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
  const routedGroups = groups.filter((group) => group.simplify_debts && !groupIsInactive(group));
  const ledgers = await groupLedgers(routedGroups.map((group) => group.id), client);
  for (const group of routedGroups) {
    for (const edge of routeDebts(ledgers.get(group.id) ?? [], true)) {
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
 * The viewer's net in each pair's one-off scope alone, per currency, for
 * many counterparties at once: one-off expenses between the two, netted
 * against one-off settlement rows, group scopes excluded entirely. The
 * one-off counterpart of {@link userNetInGroup}.
 *
 * Three reads in all, whatever the number of people: the shared expenses,
 * their payer and split rows, and the settlements. Each pair is then worked
 * out in memory from its own rows alone, exactly as a read per pair would
 * (a pair's balance never depends on anyone else's rows). It used to be
 * three reads per person, run one after another on a held connection
 * (audit A14).
 *
 * @param userId - The viewer.
 * @param otherUserIds - The counterparties; duplicates and the viewer are ignored.
 * @param client - Snapshot or transaction client; omitted, the pool.
 * @returns Counterparty id → cents per currency; > 0 ⇒ they owe the viewer one-off.
 */
export async function oneOffNetsWith(
  userId: string,
  otherUserIds: readonly string[],
  client?: PoolClient,
): Promise<Map<string, CurrencyCents>> {
  const counterpartyIds = [...new Set(otherUserIds)].filter((otherUserId) => otherUserId !== userId);
  const netsByCounterparty = new Map<string, CurrencyCents>();
  if (counterpartyIds.length === 0) return netsByCounterparty;
  const expenses = await listOneOffExpensesWithAnyOf(userId, counterpartyIds, client);
  const children = await loadExpenseChildren(
    expenses.map((expense) => expense.id),
    client,
    false,
  );
  const settlements = await listOneOffSettlementsWithAnyOf(userId, counterpartyIds, client);
  for (const otherUserId of counterpartyIds) {
    const shared = expenses.filter((expense) => participatesIn(expense.id, children, otherUserId));
    const between = settlements.filter(
      (settlement) => settlement.from_user === otherUserId || settlement.to_user === otherUserId,
    );
    const nets: CurrencyCents = new Map();
    for (const [currency, entries] of ledgersByCurrency(shared, children, between)) {
      addCents(
        nets,
        currency,
        owedInEntries(entries, otherUserId, userId) - owedInEntries(entries, userId, otherUserId),
      );
    }
    netsByCounterparty.set(otherUserId, nets);
  }
  return netsByCounterparty;
}

/**
 * Whether someone pays toward or owes a share of one expense.
 *
 * @param expenseId - The expense.
 * @param children - Its payer and split rows.
 * @param userId - The person.
 * @returns True when they are among its payers or owers.
 */
function participatesIn(expenseId: string, children: ExpenseChildren, userId: string): boolean {
  return (
    (children.payers.get(expenseId) ?? []).some((payer) => payer.user_id === userId) ||
    (children.splits.get(expenseId) ?? []).some((split) => split.user_id === userId)
  );
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
    false,
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
    (await listGroupsByUser(payerId, client)).filter((group) => !groupIsInactive(group)).map((group) => group.id),
  );
  const mutualGroups = (await listGroupsByUser(creditorId, client)).filter(
    (group) => payerGroupIds.has(group.id) && !groupIsInactive(group),
  );
  const ledgers = await groupLedgers(mutualGroups.map((group) => group.id), client);
  for (const group of mutualGroups) {
    const ledger = ledgers.get(group.id) ?? [];
    // A pairwise loop that nets to zero is not debt anyone should pay down —
    // see groupCancelsOut. Simplified groups route it away themselves.
    if (!group.simplify_debts && cancelsOut(ledger)) continue;
    const owedCents = owedInEntries(routeDebts(ledger, group.simplify_debts), payerId, creditorId);
    if (owedCents > 0) scopes.push({ groupId: group.id, currency: group.currency, owedCents });
  }
  return scopes;
}

/**
 * Everything two people owe each other, scope by scope, both directions.
 *
 * The one reading of a pair's position that settling uses. The settle dialog
 * is shown it (through {@link pairSettlePositions}) and the net-settlement
 * write recomputes it under its locks, so the two cannot be looking at
 * different ledgers: same scopes, same routing, same cancelling-loop rule.
 *
 * @param firstId - One of the two people.
 * @param secondId - The other.
 * @param client - Settlement transaction client; omitted for ordinary reads.
 * @returns Each outstanding debt with its debtor and creditor named.
 */
export async function pairScopeDebts(
  firstId: string,
  secondId: string,
  client?: PoolClient,
): Promise<DirectedScopeDebt[]> {
  const forward = await owedByScope(firstId, secondId, client);
  const backward = await owedByScope(secondId, firstId, client);
  return [
    ...forward.map((scope) => ({ ...scope, debtorId: firstId, creditorId: secondId })),
    ...backward.map((scope) => ({ ...scope, debtorId: secondId, creditorId: firstId })),
  ];
}

/** What two people can settle between them in one currency, from one side. */
export interface PairSettlePosition {
  currency: string;
  /** Net across the scopes from the viewer's side: > 0 means they are owed. */
  netCents: number;
  /** The scopes behind it, signed the same way. */
  scopes: { groupId: string | null; netCents: number }[];
  /** Fingerprint a net settlement must send back. */
  digest: string;
}

/**
 * A pair's settle positions, one per currency with anything outstanding.
 *
 * A position is read at one instant. Its two directions and each scope are
 * separate statements, so without a snapshot a settlement committing between
 * them would produce a position that never existed — one direction from
 * before the payment, the other from after.
 *
 * @param userId - The viewer.
 * @param friendId - The other person.
 * @param client - Snapshot client, so every scope reads the same instant.
 * @returns Positions by currency code, each with its scopes and digest.
 */
export async function pairSettlePositions(
  userId: string,
  friendId: string,
  client: PoolClient,
): Promise<PairSettlePosition[]> {
  const debts = await pairScopeDebts(userId, friendId, client);
  const currencies = [...new Set(debts.map((debt) => debt.currency))].sort();
  return currencies.map((currency) => {
    const scopes = debts
      .filter((debt) => debt.currency === currency)
      .map((debt) => ({
        groupId: debt.groupId,
        netCents: debt.creditorId === userId ? debt.owedCents : -debt.owedCents,
      }));
    return {
      currency,
      netCents: scopes.reduce((running, scope) => running + scope.netCents, 0),
      scopes,
      digest: positionDigest(currency, debts),
    };
  });
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
  const perCounterparty = await snapshot((client) => pairNetsForUser(userId, client));
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
    youOweCents: toInt32Cents(defaultTotals.youOweCents, "what you owe"),
    owedToYouCents: toInt32Cents(defaultTotals.owedToYouCents, "what you are owed"),
    totals: [...totals.entries()]
      .sort(([first], [second]) => defaultCurrencyFirst(defaultCurrency)(first, second))
      .map(([currency, total]) => ({
        currency,
        youOweCents: toInt32Cents(total.youOweCents, "what you owe"),
        owedToYouCents: toInt32Cents(total.owedToYouCents, "what you are owed"),
      })),
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
            netCents: toInt32Cents(buckets.get(defaultCurrency) ?? 0, "a balance"),
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
  const perCounterparty = await snapshot((client) => pairNetsForUser(userId, client));
  return perCounterparty.get(otherUserId) ?? new Map();
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

/** One internal statement line before its running balance is attached. */
interface FriendLedgerLine {
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
  /** The net settlement a settlement line belongs to; "" otherwise. */
  netSettlementId: string;
  /** True for a net settlement's cancelling line. */
  offset: boolean;
}

/** One routed balance between the pair inside a single scope and currency. */
interface FriendLedgerScopeBalance {
  groupId: string;
  groupName: string;
  currency: string;
  netCents: number;
  simplified: boolean;
}

/**
 * Loads group metadata for statement expenses and payments in one query.
 *
 * @param expenses - Shared expenses whose group labels will be rendered.
 * @param settlements - Shared payments, including ones without a shared expense.
 * @param client - Snapshot client the rest of the statement is read on.
 * @returns Group id to metadata, including lifecycle status and display name.
 */
async function groupsForHistory(
  expenses: ExpenseRow[],
  settlements: SettlementRow[],
  client: PoolClient,
): Promise<Map<string, GroupRow>> {
  const groupIds = new Set(
    [...expenses, ...settlements].flatMap((entry) => entry.group_id ? [entry.group_id] : []),
  );
  if (groupIds.size === 0) return new Map();
  return new Map((await findGroupsByIds([...groupIds], client)).map((group) => [group.id, group]));
}

/**
 * Maps shared expense rows to the movements they made between this pair.
 *
 * @param expenses - Expenses shared by the pair, deleted rows included.
 * @param children - Payers and splits for those expenses.
 * @param groupNames - Group labels keyed by id.
 * @param userId - Statement viewer.
 * @param friendId - Other person on the statement.
 * @returns Expense lines that affected the pair.
 */
function expenseLedgerLines(
  expenses: ExpenseRow[],
  children: ExpenseChildren,
  groupNames: ReadonlyMap<string, string>,
  userId: string,
  friendId: string,
): FriendLedgerLine[] {
  const lines: FriendLedgerLine[] = [];
  for (const expense of expenses) {
    const debts = debtsFromExpenses([expense], children);
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
      // A deleted line remains explanatory history but no longer moves money.
      deltaCents: deleted ? 0 : liveDeltaCents,
      sortKey: `${expense.expense_date}T${expense.created_at}`,
      // An expense date is a calendar day, not a moment to localize.
      createdAt: "",
      deleted,
      recordedByName: "",
      netSettlementId: "",
      offset: false,
    });
  }
  return lines;
}

/**
 * Maps settlement rows to statement movements from the viewer's perspective.
 *
 * @param settlements - Payments between the pair, deleted rows included.
 * @param groupNames - Group labels keyed by id.
 * @param userId - Statement viewer.
 * @param friendName - Other person's display name.
 * @returns One line per stored payment.
 */
function settlementLedgerLines(
  settlements: SettlementRow[],
  groupNames: ReadonlyMap<string, string>,
  userId: string,
  friendName: string,
): FriendLedgerLine[] {
  return settlements.map((settlement) => {
    const paidByYou = settlement.from_user === userId;
    const deleted = settlement.deleted_at !== null;
    // An offset moved no money; it cancelled this balance against one
    // pointing the other way elsewhere, and the statement says so.
    const offset = settlement.method === OFFSET_SETTLEMENT_METHOD;
    return {
      kind: "settlement",
      id: settlement.id,
      date: settlement.created_at.slice(0, 10),
      // Whose debt it was, from the reader's side, so neither person has to
      // work out which way a cancelled balance ran.
      description: offset
        ? paidByYou
          ? `Cancelled: what you owed ${friendName}`
          : `Cancelled: what ${friendName} owed you`
        : `${paidByYou ? "You paid" : `${friendName} paid you`}${
            // How the money moved, when the payment named a method.
            settlement.method_label ? ` via ${settlement.method_label}` : ""
          }`,
      groupId: settlement.group_id ?? "",
      groupName: settlement.group_id ? (groupNames.get(settlement.group_id) ?? "") : "",
      currency: settlement.currency,
      totalCents: settlement.amount_cents,
      deltaCents: deleted ? 0 : paidByYou ? settlement.amount_cents : -settlement.amount_cents,
      // A net settlement's rows share one timestamp. Its cancelled balances
      // sort ahead of its payment, so in the newest-first statement the
      // payment leads and what it cancelled follows directly beneath it —
      // in the same order for both people.
      sortKey: `${settlement.created_at.slice(0, 10)}T${settlement.created_at}${offset ? "0" : "1"}${settlement.id}`,
      createdAt: settlement.created_at,
      deleted,
      // A payment is a claim one of the pair recorded; keep who asserted it.
      recordedByName: settlement.recorded_by === userId ? "you" : friendName,
      netSettlementId: settlement.net_settlement_id ?? "",
      offset,
    };
  });
}

/** One of the two people on a statement, as the removal check needs them. */
interface LedgerParty {
  /** Their name; undefined for the reader, who is addressed as "you". */
  name: string | undefined;
  /** Every group they belong to now. */
  groupIds: Set<string>;
}

/**
 * Why removing each payment between two people would be refused because one
 * of them has since left the group it is in: the rule deleteSettlement
 * enforces (audit A07), worked out for the statement so each line can say so
 * in place of its Remove action instead of sending a request that fails. A
 * net settlement is removed whole, so one of its lines in such a group blocks
 * every line of it.
 *
 * @param settlements - Every payment between the pair, removed ones included.
 * @param groupNames - Names of the groups those payments sit in.
 * @param parties - The reader and the other person.
 * @returns Settlement id → refusal, for the lines whose removal would be refused.
 */
function settlementRemovalRefusals(
  settlements: SettlementRow[],
  groupNames: Map<string, string>,
  parties: LedgerParty[],
): Map<string, string> {
  const refusalByUnit = new Map<string, string>();
  for (const settlement of settlements) {
    const groupId = settlement.group_id;
    if (settlement.deleted_at || !groupId) continue;
    const unitKey = settlement.net_settlement_id ?? settlement.id;
    if (refusalByUnit.has(unitKey)) continue;
    const former = parties.find((party) => !party.groupIds.has(groupId));
    if (former) {
      refusalByUnit.set(unitKey, formerMemberRefusal(groupNames.get(groupId) ?? "this group", former.name));
    }
  }
  const refusalById = new Map<string, string>();
  for (const settlement of settlements) {
    const refusal = refusalByUnit.get(settlement.net_settlement_id ?? settlement.id);
    if (refusal) refusalById.set(settlement.id, refusal);
  }
  return refusalById;
}

/**
 * Sorts statement lines oldest-first and attaches one running balance per currency.
 *
 * @param lines - Unordered expense and settlement movements.
 * @returns Proto-ready entries, newest first.
 */
function friendLedgerEntries(lines: FriendLedgerLine[]) {
  lines.sort((first, second) => first.sortKey.localeCompare(second.sortKey));
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
      deltaCents: toInt32Cents(line.deltaCents, "a line's change"),
      balanceAfterCents: toInt32Cents(runningCents, "the running balance"),
      createdAt: line.createdAt,
      deleted: line.deleted,
      recordedByName: line.recordedByName,
      netSettlementId: line.netSettlementId,
      offset: line.offset,
    };
  });
  return entries.reverse();
}

/**
 * Builds the stable key used for a pair's group/one-off currency scope.
 *
 * @param groupId - Group id, or an empty string for the one-off slate.
 * @param currency - Scope currency.
 * @returns Composite history key.
 */
function friendScopeKey(groupId: string, currency: string): string {
  return `${groupId}|${currency}`;
}

/**
 * Totals raw statement history by scope and currency.
 *
 * @param lines - Statement movements.
 * @returns Composite scope key to net cents.
 */
function historyNetsByScope(lines: FriendLedgerLine[]): Map<string, number> {
  const nets = new Map<string, number>();
  for (const line of lines) {
    const scope = friendScopeKey(line.groupId, line.currency);
    nets.set(scope, (nets.get(scope) ?? 0) + line.deltaCents);
  }
  return nets;
}

/**
 * Replaces raw history with the routed edge for simplified mutual groups.
 *
 * @param mutualGroups - Groups both people currently belong to.
 * @param historyNets - Raw pair history by scope; consumed by this function.
 * @param historyGroups - Group metadata keyed by id, including past memberships.
 * @param userId - Statement viewer.
 * @param friendId - Other person on the statement.
 * @param client - Snapshot client the rest of the statement is read on.
 * @returns Per-scope balances following each group's routing mode.
 */
async function friendScopeBalances(
  mutualGroups: GroupRow[],
  historyNets: Map<string, number>,
  historyGroups: ReadonlyMap<string, GroupRow>,
  userId: string,
  friendId: string,
  client: PoolClient,
): Promise<FriendLedgerScopeBalance[]> {
  const balances: FriendLedgerScopeBalance[] = [];
  for (const scope of historyNets.keys()) {
    const group = historyGroups.get(scope.split("|")[0]);
    if (group && groupIsInactive(group)) historyNets.delete(scope);
  }
  const routedGroups = mutualGroups.filter((group) => group.simplify_debts && !groupIsInactive(group));
  const ledgers = await groupLedgers(routedGroups.map((group) => group.id), client);
  for (const group of routedGroups) {
    const edges = simplifyDebts(netBalances(ledgers.get(group.id) ?? []));
    const routedCents =
      owedInEntries(edges, friendId, userId) - owedInEntries(edges, userId, friendId);
    const scopeKey = friendScopeKey(group.id, group.currency);
    const historyCents = historyNets.get(scopeKey) ?? 0;
    historyNets.delete(scopeKey);
    if (routedCents !== 0 || historyCents !== 0) {
      balances.push({
        groupId: group.id,
        groupName: group.name,
        currency: group.currency,
        netCents: routedCents,
        simplified: true,
      });
    }
  }
  for (const [scope, historyCents] of historyNets) {
    if (historyCents === 0) continue;
    const [groupId, currency] = scope.split("|");
    balances.push({
      groupId,
      groupName: groupId ? (historyGroups.get(groupId)?.name ?? "") : "",
      currency,
      netCents: historyCents,
      simplified: false,
    });
  }
  return balances;
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
  const isFriend = (await listFriendIds(userId)).includes(friendId);

  // Every figure below — the statement, the balances above it, and the
  // position a settle dialog works from — is read at one instant. They are
  // many statements, and a settlement committing between two of them would
  // otherwise return a response whose parts describe different ledgers.
  return snapshot(async (client) => {
    const expenses = await listExpensesBetween(userId, friendId, true, client);
    const children = await loadExpenseChildren(
      expenses.map((expense) => expense.id),
      client,
      false,
    );
    const settlements = await listSettlementsBetween(userId, friendId, true, client);
    const historyGroups = await groupsForHistory(expenses, settlements, client);
    const groupNames = new Map([...historyGroups].map(([groupId, group]) => [groupId, group.name]));
    const lines = [
      ...expenseLedgerLines(expenses, children, groupNames, userId, friendId),
      ...settlementLedgerLines(settlements, groupNames, userId, friend?.name ?? ""),
    ];
    const entries = friendLedgerEntries(lines);
    // The statement is a display; the balances above it are computed over
    // everything. Past the cap the oldest lines are left off and the response
    // says so, rather than shipping an unbounded table to a phone.
    const truncated = entries.length > LEDGER_DISPLAY_LIMIT;
    const shownEntries = truncated ? entries.slice(0, LEDGER_DISPLAY_LIMIT) : entries;

    const netByScope = historyNetsByScope(lines);

    // Relationship context, not balance context: which groups both belong to
    // (settled ones included — "where do I know them from" is not "where does
    // money move"), and whether an explicit friendship exists.
    const friendGroupIds = new Set(
      (await listGroupsByUser(friendId, client)).map((group) => group.id),
    );
    const callerGroupRows = await listGroupsByUser(userId, client);
    const mutualGroupRows = callerGroupRows.filter((group) => friendGroupIds.has(group.id));
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
    const groupBalances = await friendScopeBalances(
      mutualGroupRows,
      netByScope,
      historyGroups,
      userId,
      friendId,
      client,
    );
    // The headline: one net per currency, each the sum of that currency's
    // scopes — the same routed numbers the dashboard shows and the settlement
    // guards enforce.
    const nets: CurrencyCents = new Map();
    for (const scope of groupBalances) addCents(nets, scope.currency, scope.netCents);

    // What a settle dialog works from: not the statement above, but the very
    // position the settlement write will recompute, with its fingerprint.
    const groupsById = new Map(mutualGroupRows.map((group) => [group.id, group]));
    const settlePositions = (await pairSettlePositions(userId, friendId, client)).map((position) => ({
      currency: position.currency,
      netCents: toInt32Cents(position.netCents, "a balance"),
      digest: position.digest,
      scopes: position.scopes.map((scope) => {
        const group = scope.groupId ? groupsById.get(scope.groupId) : undefined;
        return {
          groupId: scope.groupId ?? "",
          groupName: group?.name ?? "",
          netCents: toInt32Cents(scope.netCents, "a balance"),
          simplified: group?.simplify_debts ?? false,
        };
      }),
    }));

    // How the friend wants to be paid goes only to someone about to pay
    // them. A scope counts on its own, not just the net: one balance can be
    // settled alone, so a caller who owes inside one group needs the details
    // even when the friend owes them more somewhere else.
    const callerOwes = settlePositions.some(
      (position) => position.netCents < 0 || position.scopes.some((scope) => scope.netCents < 0),
    );
    const payee = callerOwes
      ? await listPayeeMethods(friendId, client)
      : { methods: [], removedAt: "" };

    // Each payment line says up front when removing it would be refused.
    const removalRefusals = settlementRemovalRefusals(settlements, groupNames, [
      { name: undefined, groupIds: new Set(callerGroupRows.map((group) => group.id)) },
      { name: friend.name, groupIds: friendGroupIds },
    ]);

    return {
      friend: toPublicUser(friend),
      netCents: toInt32Cents(nets.get(defaultCurrency) ?? 0, "this balance"),
      currency: defaultCurrency,
      nets: currencyAmounts(nets, defaultCurrency),
      entries: shownEntries.map((entry) => ({
        ...entry,
        removalRefusal: removalRefusals.get(entry.id) ?? "",
      })),
      truncated,
      settlePositions,
      payeeMethods: payee.methods,
      // The server's own clock, so "changed 2 days ago" does not depend on
      // the payer's device being set right.
      readAt: new Date().toISOString(),
      payeeMethodRemovedAt: payee.removedAt,
      groupBalances: groupBalances.map((scope) => ({
        ...scope,
        netCents: toInt32Cents(scope.netCents, "a balance"),
      })),
      isFriend,
      mutualGroups: mutualGroupRows.map((group) => ({
        groupId: group.id,
        groupName: group.name,
        groupType: group.type,
      })),
    };
  });
}
