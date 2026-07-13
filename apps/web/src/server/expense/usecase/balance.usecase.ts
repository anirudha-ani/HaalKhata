/** Balance business logic: builds group/user ledgers from repos and applies the domain balance math. */

import {
  listExpensesByGroup,
  listExpensesInvolvingUser,
  loadExpenseChildren,
} from "@/server/expense/repo/expenses.repo";
import {
  listSettlementsByGroup,
  listSettlementsInvolvingUser,
} from "@/server/expense/repo/settlements.repo";
import { isMember, listMembers } from "@/server/group/repo/groups.repo";
import { findUsersByIds } from "@/server/auth/repo/users.repo";
import {
  expenseDebts,
  netBalances,
  pairwiseBalances,
  simplifyDebts,
  type LedgerEntry,
} from "../domain/balances";
import { denied, notFound } from "@/server/common/errors";
import { toUser } from "@/server/auth/usecase/user.mapper";

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
  const debts = expenses.flatMap((expense) =>
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
  const settlements = (await listSettlementsByGroup(groupId)).map((settlement) => ({
    from: settlement.from_user,
    to: settlement.to_user,
    amountCents: settlement.amount_cents,
  }));
  return pairwiseBalances(debts, settlements);
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
 * Builds the user's global ledger: pairwise entries between the user and
 * everyone else, across all their expenses and settlements (groups + one-off).
 *
 * @param userId - User whose ledger is built.
 * @returns Pairwise entries that involve the user, one per counterparty pair.
 */
async function userLedger(userId: string): Promise<LedgerEntry[]> {
  const expenses = await listExpensesInvolvingUser(userId);
  const children = await loadExpenseChildren(expenses.map((expense) => expense.id));
  const debts = expenses.flatMap((expense) =>
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
  const settlements = (await listSettlementsInvolvingUser(userId)).map((settlement) => ({
    from: settlement.from_user,
    to: settlement.to_user,
    amountCents: settlement.amount_cents,
  }));
  return pairwiseBalances(debts, settlements).filter(
    (debt) => debt.from === userId || debt.to === userId,
  );
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
