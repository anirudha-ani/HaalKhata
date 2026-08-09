/** Balance business logic: builds group/user ledgers from repos and applies the domain balance math. */

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
import { toUser } from "@/server/auth/usecase/user.mapper";

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
async function groupLedger(groupId: string): Promise<LedgerEntry[]> {
  const expenses = await listExpensesByGroup(groupId);
  const children = await loadExpenseChildren(expenses.map((expense) => expense.id));
  const settlements = (await listSettlementsByGroup(groupId)).map((settlement) => ({
    from: settlement.from_user,
    to: settlement.to_user,
    amountCents: settlement.amount_cents,
  }));
  return pairwiseBalances(debtsFromExpenses(expenses, children), settlements);
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
 * @returns Net cents; > 0 ⇒ the user is owed money in this group.
 */
export async function userNetInGroup(userId: string, groupId: string): Promise<number> {
  return netBalances(await groupLedger(groupId)).get(userId) ?? 0;
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
 * How much `debtorId` currently owes `creditorId` inside one group. Returns a
 * non-negative number of cents (0 when nothing is owed or the direction is
 * reversed). Used by recordSettlement to refuse over-settling a group scope;
 * the cross-scope equivalent is {@link owedByScope}.
 *
 * @param debtorId - User who would be paying.
 * @param creditorId - User who would be receiving.
 * @param groupId - Group whose ledger is consulted.
 * @returns Non-negative cents the debtor owes the creditor in that group.
 */
export async function amountOwed(
  debtorId: string,
  creditorId: string,
  groupId: string,
): Promise<number> {
  return owedInEntries(await groupLedger(groupId), debtorId, creditorId);
}

/**
 * Builds the user's global ledger: pairwise entries between the user and
 * everyone else, across all their expenses and settlements (groups + one-off).
 *
 * @param userId - User whose ledger is built.
 * @returns Pairwise entries that involve the user, one per counterparty pair.
 */
async function userLedger(userId: string): Promise<LedgerEntry[]> {
  const expenses = await listExpensesInvolvingUser(userId);
  const children = await loadExpenseChildren(expenses.map((expense) => expense.id));
  const settlements = (await listSettlementsInvolvingUser(userId)).map((settlement) => ({
    from: settlement.from_user,
    to: settlement.to_user,
    amountCents: settlement.amount_cents,
  }));
  return pairwiseBalances(debtsFromExpenses(expenses, children), settlements).filter(
    (debt) => debt.from === userId || debt.to === userId,
  );
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
 * The viewer's net in the pair's one-off scope alone: one-off expenses
 * between the two, netted against one-off settlement rows, group scopes
 * excluded entirely. The one-off counterpart of {@link userNetInGroup}.
 *
 * @param userId - The viewer.
 * @param otherUserId - The counterparty.
 * @returns Net cents; > 0 ⇒ the other user owes the viewer one-off.
 */
export async function oneOffNetBetween(userId: string, otherUserId: string): Promise<number> {
  const expenses = await listOneOffExpensesBetween(userId, otherUserId);
  const children = await loadExpenseChildren(expenses.map((expense) => expense.id));
  const settlements = (await listOneOffSettlementsBetween(userId, otherUserId)).map(
    (settlement) => ({
      from: settlement.from_user,
      to: settlement.to_user,
      amountCents: settlement.amount_cents,
    }),
  );
  const entries = pairwiseBalances(debtsFromExpenses(expenses, children), settlements);
  return (
    owedInEntries(entries, otherUserId, userId) - owedInEntries(entries, userId, otherUserId)
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
 * @param payerId - The user paying.
 * @param creditorId - The user being paid.
 * @returns Scopes with a positive payer→creditor debt; order is not meaningful.
 */
export async function owedByScope(payerId: string, creditorId: string): Promise<ScopeDebt[]> {
  const scopes: ScopeDebt[] = [];

  const oneOffExpenses = await listOneOffExpensesBetween(payerId, creditorId);
  const children = await loadExpenseChildren(oneOffExpenses.map((expense) => expense.id));
  const oneOffSettlements = (await listOneOffSettlementsBetween(payerId, creditorId)).map(
    (settlement) => ({
      from: settlement.from_user,
      to: settlement.to_user,
      amountCents: settlement.amount_cents,
    }),
  );
  const oneOffCents = owedInEntries(
    pairwiseBalances(debtsFromExpenses(oneOffExpenses, children), oneOffSettlements),
    payerId,
    creditorId,
  );
  if (oneOffCents > 0) scopes.push({ groupId: null, owedCents: oneOffCents });

  const payerGroupIds = new Set((await listGroupsByUser(payerId)).map((group) => group.id));
  for (const group of await listGroupsByUser(creditorId)) {
    if (!payerGroupIds.has(group.id)) continue;
    const owedCents = owedInEntries(await groupLedger(group.id), payerId, creditorId);
    if (owedCents > 0) scopes.push({ groupId: group.id, owedCents });
  }
  return scopes;
}

/**
 * The caller's overall position: total owed by them, total owed to them, and
 * a per-counterparty breakdown sorted by size.
 *
 * @param userId - Authenticated caller.
 * @returns Totals plus one entry per counterparty (positive net ⇒ they owe the caller).
 * @throws UsecaseError (not_found) if a counterparty's user row is missing.
 */
export async function getOverallBalances(userId: string) {
  const entries = await userLedger(userId);
  let youOweCents = 0;
  let owedToYouCents = 0;
  const perCounterparty = new Map<string, number>(); // > 0 ⇒ they owe you
  for (const entry of entries) {
    if (entry.from === userId) {
      youOweCents += entry.amountCents;
      perCounterparty.set(
        entry.to,
        (perCounterparty.get(entry.to) ?? 0) - entry.amountCents,
      );
    } else {
      owedToYouCents += entry.amountCents;
      perCounterparty.set(
        entry.from,
        (perCounterparty.get(entry.from) ?? 0) + entry.amountCents,
      );
    }
  }
  const users = new Map(
    (await findUsersByIds([...perCounterparty.keys()])).map((user) => [user.id, user]),
  );
  return {
    youOweCents,
    owedToYouCents,
    counterparties: [...perCounterparty.entries()]
      .sort(([, firstNet], [, secondNet]) => Math.abs(secondNet) - Math.abs(firstNet))
      .flatMap(([counterpartyId, netCents]) => {
        const user = users.get(counterpartyId);
        if (!user) notFound(`unknown user ${counterpartyId}`);
        return [{ user: toUser(user), netCents }];
      }),
  };
}

/**
 * Net position between the caller and one other user.
 *
 * @param userId - Authenticated caller.
 * @param otherUserId - The counterparty to measure against.
 * @returns Net cents; > 0 ⇒ the other user owes the caller.
 */
export async function netWithUser(userId: string, otherUserId: string): Promise<number> {
  for (const entry of await userLedger(userId)) {
    if (entry.from === otherUserId) return entry.amountCents;
    if (entry.to === otherUserId) return -entry.amountCents;
  }
  return 0;
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
 * statement row that changes no balance is noise.
 *
 * @param userId - Authenticated caller.
 * @param friendId - The other person.
 * @returns The friend, the net (> 0 ⇒ they owe you), the currency, the entries
 *   newest-first, and the per-group breakdown.
 * @throws UsecaseError (not_found) when the friend's user row is missing.
 */
export async function getFriendLedger(userId: string, friendId: string) {
  const friend = await findUserById(friendId);
  if (!friend) notFound("user not found");

  const expenses = await listExpensesBetween(userId, friendId);
  const children = await loadExpenseChildren(expenses.map((expense) => expense.id));
  const settlements = await listSettlementsBetween(userId, friendId);

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
    totalCents: number;
    deltaCents: number;
    sortKey: string;
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
    const deltaCents = pairDelta(debts, userId, friendId);
    if (deltaCents === 0) continue;
    lines.push({
      kind: "expense",
      id: expense.id,
      date: expense.expense_date,
      description: expense.description,
      groupId: expense.group_id ?? "",
      groupName: expense.group_id ? (groupNames.get(expense.group_id) ?? "") : "",
      totalCents: expense.amount_cents,
      deltaCents,
      sortKey: `${expense.expense_date}T${expense.created_at}`,
    });
  }

  for (const settlement of settlements) {
    // You paying them shrinks your debt, so it moves the balance in your
    // favour exactly as an expense they owed you on would.
    const paidByYou = settlement.from_user === userId;
    lines.push({
      kind: "settlement",
      id: settlement.id,
      date: settlement.created_at.slice(0, 10),
      description: paidByYou ? "You paid" : `${friend.name} paid you`,
      groupId: settlement.group_id ?? "",
      groupName: settlement.group_id ? (groupNames.get(settlement.group_id) ?? "") : "",
      totalCents: settlement.amount_cents,
      deltaCents: paidByYou ? settlement.amount_cents : -settlement.amount_cents,
      sortKey: `${settlement.created_at.slice(0, 10)}T${settlement.created_at}`,
    });
  }

  lines.sort((first, second) => first.sortKey.localeCompare(second.sortKey));
  let runningCents = 0;
  const entries = lines.map((line) => {
    runningCents += line.deltaCents;
    return {
      kind: line.kind,
      id: line.id,
      date: line.date,
      description: line.description,
      groupId: line.groupId,
      groupName: line.groupName,
      totalCents: line.totalCents,
      deltaCents: line.deltaCents,
      balanceAfterCents: runningCents,
    };
  });
  entries.reverse();

  const netByGroup = new Map<string, number>();
  for (const line of lines) {
    netByGroup.set(line.groupId, (netByGroup.get(line.groupId) ?? 0) + line.deltaCents);
  }

  // Relationship context, not balance context: which groups both belong to
  // (settled ones included — "where do I know them from" is not "where does
  // money move"), and whether an explicit friendship exists. The page shows
  // any pair, so it has to say which relationship it is showing.
  const friendGroupIds = new Set((await listGroupsByUser(friendId)).map((group) => group.id));
  const mutualGroups = (await listGroupsByUser(userId))
    .filter((group) => friendGroupIds.has(group.id))
    .map((group) => ({
      groupId: group.id,
      groupName: group.name,
      groupType: group.type,
    }));
  const isFriend = (await listFriendIds(userId)).includes(friendId);

  return {
    friend: toUser(friend),
    netCents: runningCents,
    currency: friend.default_currency || "USD",
    entries,
    groupBalances: [...netByGroup.entries()]
      .filter(([, netCents]) => netCents !== 0)
      .map(([groupId, netCents]) => ({
        groupId,
        groupName: groupId ? (groupNames.get(groupId) ?? "") : "",
        netCents,
      })),
    isFriend,
    mutualGroups,
  };
}
