/**
 * Live splits: an itemized expense opened to everyone at the table for 30
 * minutes through a link. People join, claim what they had and fix the
 * receipt together, through the same merged edits as any other change, so
 * the ledger is exact at every moment; lines nobody has claimed count against
 * whoever paid, by what each paid. Nobody's phone buzzes per tick: the end
 * announces the result once, to everyone on the expense, and leaves an
 * ordinary bill that they can settle whenever they like.
 */

import type { UserRow } from "@/server/auth/repo/users.repo";
import { findUserById } from "@/server/auth/repo/users.repo";
import { denied, invalid, notFound, UsecaseError } from "@/server/common/errors";
import { lockExpenseLedger, lockParticipantLedgers, withLedgerTransaction } from "@/server/common/ledger/ledgerLocks";
import { logError } from "@/server/common/logger";
import { LIVE_SPLIT_ENDED_MESSAGE } from "@haalkhata/shared/expense/live/live.constants";
import { LIVE_SPLIT_SWEEP_BATCH_SIZE, MAX_EXPENSE_PARTICIPANTS } from "@/server/expense/expense.constants";
import { findExpenseById, loadExpenseChildren } from "@/server/expense/repo/expenses.repo";
import {
  bumpExpenseVersion,
  findLiveSplitById,
  findRunningLiveSplit,
  insertLiveSplitPerson,
  insertUnsharedPerson,
  forgetEndedLiveSplitPeople,
  listDueLiveSplitExpenses,
  listLiveSplitPeople,
  markLiveSplitChanged,
} from "@/server/expense/repo/liveSplits.repo";
import { findGroupById, isMember } from "@/server/group/repo/groups.repo";
import { assertGroupActive } from "@/server/group/usecase/groupArchive";
import { blockedPairExists } from "@/server/safety/repo/safety.repo";
import { insertFriendships } from "@/server/social/repo/friendships.repo";
import type { InviteLinkRow } from "@/server/social/repo/inviteLinks.repo";
import { DEAD_LINK_MESSAGE } from "@/server/social/social.constants";
import { joinGroupThroughLink } from "@/server/social/usecase/groupLinkJoin";
import { assertCanEdit, closeLiveSplit, storedParticipantIds } from "../expense.usecase";
import { liveSessionOf, openLiveSession } from "./liveSession";

/**
 * A running split as the API speaks it.
 *
 * @param expenseId - Its expense.
 * @returns The split; null when none is running.
 */
async function liveSplitMessage(expenseId: string) {
  const session = await liveSessionOf(expenseId);
  if (!session) return null;
  return {
    token: session.split.token,
    hostId: session.split.host_id,
    endsAt: session.split.ends_at,
    peopleIds: session.peopleIds,
    savedIds: session.savedIds,
  };
}

/**
 * Opens an expense for everyone at the table, or returns the split already
 * running on it. Anyone who may edit the expense may start one.
 *
 * @param userId - Authenticated caller.
 * @param expenseId - The expense.
 * @returns The running split.
 * @throws UsecaseError when the expense is missing or deleted, the caller may
 *   not edit it.
 */
export async function startLiveSplit(userId: string, expenseId: string) {
  let removed = false;
  await withLedgerTransaction(async (client) => {
    await lockExpenseLedger(client, expenseId);
    const expense = await findExpenseById(expenseId, client);
    if (!expense || expense.deleted_at) notFound("expense not found");
    const children = await loadExpenseChildren([expenseId], client);
    await assertCanEdit(userId, expense, children, client);
    if (expense.group_id) await assertGroupActive(expense.group_id, client);
    const running = await findRunningLiveSplit(expenseId, client);
    if (running && !running.due) return;
    if (running) await closeLiveSplit(running, client);
    // Closing removes a bill nobody ever filled in, and nothing can open on that.
    removed = (await findExpenseById(expenseId, client))?.deleted_at != null;
    if (removed) return;
    await openLiveSession(expenseId, userId, false, client);
    await bumpExpenseVersion(expenseId, client);
  });
  if (removed) notFound("expense not found");
  return (await liveSplitMessage(expenseId))!;
}

/**
 * Ends a live split before its time.
 *
 * @param userId - Authenticated caller; must have started it.
 * @param expenseId - The expense.
 * @throws UsecaseError (permission_denied) from anybody else.
 */
export async function finishLiveSplit(userId: string, expenseId: string): Promise<void> {
  await withLedgerTransaction(async (client) => {
    await lockExpenseLedger(client, expenseId);
    const running = await findRunningLiveSplit(expenseId, client);
    if (!running) return;
    if (running.host_id !== userId) denied("only whoever started this live split can finish it");
    await closeLiveSplit(running, client);
  });
}

/**
 * Finishes the live splits past their end, and forgets who was in the ones
 * that ended long enough ago. A split that fails is left for the next pass and
 * does not stop the others.
 *
 * @returns How many it finished.
 */
export async function finishDueLiveSplits(): Promise<number> {
  await forgetEndedLiveSplitPeople();
  const expenseIds = await listDueLiveSplitExpenses(LIVE_SPLIT_SWEEP_BATCH_SIZE);
  let finished = 0;
  for (const expenseId of expenseIds) {
    try {
      await withLedgerTransaction(async (client) => {
        await lockExpenseLedger(client, expenseId);
        const running = await findRunningLiveSplit(expenseId, client);
        if (running?.due) await closeLiveSplit(running, client);
      });
      finished += 1;
    } catch (error) {
      logError(error, { scope: "live-split-sweep" });
    }
  }
  return finished;
}

/**
 * What a live split's link offers, for the landing page to show before
 * anyone signs in. Holding the unguessable link is the credential.
 *
 * @param link - The link.
 * @returns The preview.
 */
export async function previewLiveSplit(link: InviteLinkRow) {
  const split = await findLiveSplitById(link.live_split_id!);
  const expense = split ? await findExpenseById(split.expense_id) : undefined;
  if (!split || !expense || expense.deleted_at) throw new UsecaseError("failed_precondition", LIVE_SPLIT_ENDED_MESSAGE);
  const inviter = await findUserById(link.inviter_id);
  const group = expense.group_id ? await findGroupById(expense.group_id) : undefined;
  return {
    kind: "live",
    inviterName: inviter?.name ?? "Someone",
    groupName: group?.name ?? "",
    memberCount: (await listLiveSplitPeople(split.id)).length,
    invitedName: "",
    expenseDescription: expense.description,
    totalCents: expense.amount_cents,
    currency: expense.currency,
  };
}

/**
 * Joins somebody to a live split through its link.
 *
 * On a group's bill everyone on it must be in the group, so joining joins the
 * group too, as the join page says first: the same trust a group's own link
 * asks, for a shorter while. On a one-off bill it befriends them with whoever
 * started the split and whoever paid, as adding them to the expense would: a
 * debt runs between them.
 *
 * @param acceptor - Who is joining.
 * @param link - The link.
 * @returns The expense, to land on.
 * @throws UsecaseError when the split has ended, is full, or somebody on it
 *   and this person have blocked one another.
 */
export async function joinLiveSplit(acceptor: UserRow, link: InviteLinkRow): Promise<string> {
  const userId = acceptor.id;
  const split = await findLiveSplitById(link.live_split_id!);
  const expense = split ? await findExpenseById(split.expense_id) : undefined;
  if (!split || !expense || expense.deleted_at) throw new UsecaseError("failed_precondition", LIVE_SPLIT_ENDED_MESSAGE);
  const expenseId = expense.id;
  // Only a block involving whoever is joining counts: one between two people
  // already here stops nobody else.
  const alreadyHere = [split.host_id, ...storedParticipantIds(expense, await loadExpenseChildren([expenseId]))];
  if (await blockedPairExists([userId, ...alreadyHere], alreadyHere)) notFound(DEAD_LINK_MESSAGE);

  if (expense.group_id && !(await isMember(expense.group_id, userId))) {
    const group = await findGroupById(expense.group_id);
    if (!group) notFound("group not found");
    await joinGroupThroughLink(acceptor, group, link.inviter_id, (await findUserById(link.inviter_id))?.name ?? "a member");
  }

  await withLedgerTransaction(async (client) => {
    await lockExpenseLedger(client, expenseId);
    const session = await liveSessionOf(expenseId, client);
    if (!session || session.split.id !== split.id) throw new UsecaseError("failed_precondition", LIVE_SPLIT_ENDED_MESSAGE);
    if (session.peopleIds.includes(userId)) return;
    if (session.peopleIds.length >= MAX_EXPENSE_PARTICIPANTS) invalid("this live split is full");
    if (!expense.group_id) {
      const children = await loadExpenseChildren([expenseId], client);
      const payerIds = (children.payers.get(expenseId) ?? []).map((payer) => payer.user_id);
      await lockParticipantLedgers(client, [...new Set([userId, split.host_id, ...payerIds])]);
      await insertFriendships(userId, [split.host_id, ...payerIds], client);
    }
    await insertLiveSplitPerson(split.id, userId, client);
    await insertUnsharedPerson(expenseId, userId, client);
    await markLiveSplitChanged(split.id, client);
    await bumpExpenseVersion(expenseId, client);
  });
  return expenseId;
}
