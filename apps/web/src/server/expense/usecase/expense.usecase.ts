/** Expense business logic: validation + authoritative splits, comments, settlements, activity/notification fan-out. */

import type { CreateExpenseRequest } from "@haalkhata/protogen/expense/v1/expense_pb";
import {
  findExpenseById,
  insertExpense,
  listExpensesByGroup,
  listExpensesInvolvingUser,
  listOneOffExpensesBetween,
  loadExpenseChildren,
  replaceExpense,
  softDeleteExpense,
  type ExpenseChildren,
  type ExpenseRow,
  type ExpenseWrite,
} from "@/server/expense/repo/expenses.repo";
import { findGroupById, isMember, listMembers } from "@/server/group/repo/groups.repo";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import { insertFriendship } from "@/server/social/repo/friendships.repo";
import { insertComment, listCommentsByExpense } from "@/server/expense/repo/comments.repo";
import { insertSettlement } from "@/server/expense/repo/settlements.repo";
import { insertActivity } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import {
  computeItemizedSplits,
  computeSplits,
  SplitError,
} from "../domain/splits";
import { amountOwed } from "./balance.usecase";
import { denied, invalid, notFound } from "@/server/common/errors";
import { toUser } from "@/server/auth/usecase/user.mapper";
import { SPLIT_TYPES } from "@/server/expense/expense.constants";
import { toExpense, toSettlement } from "./expense.mapper";

/**
 * Formats an integer cent amount for human-readable messages, e.g. "USD 12.50".
 *
 * @param cents - Amount in integer cents.
 * @param currency - Currency code to prefix the amount with.
 * @returns The formatted amount string.
 */
function formatMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

/**
 * Validates a create/update request and computes the authoritative splits.
 * Resolves the currency (group currency wins, then the caller's default),
 * recomputes splits server-side (client amounts are never trusted), and
 * checks that payments cover the total and every participant exists (and,
 * for group expenses, is a member).
 *
 * @param userId - Authenticated caller creating or updating the expense.
 * @param request - Raw expense request from the client.
 * @returns A fully validated `ExpenseWrite` ready for the repo layer.
 * @throws UsecaseError (invalid_argument / not_found / permission_denied) on
 *   any validation, existence, or membership failure.
 */
async function buildExpenseWrite(
  userId: string,
  request: CreateExpenseRequest,
): Promise<ExpenseWrite> {
  const description = request.description.trim();
  if (description.length === 0) invalid("description is required");
  if (!SPLIT_TYPES.has(request.splitType)) invalid(`unknown split type "${request.splitType}"`);

  const groupId = request.groupId || null;
  let currency = request.currency;
  if (groupId) {
    const group = await findGroupById(groupId);
    if (!group) notFound("group not found");
    if (!(await isMember(groupId, userId))) denied("you are not a member of this group");
    currency = group.currency;
  }
  if (!currency) currency = (await findUserById(userId))?.default_currency ?? "USD";

  let amountCents: number;
  let taxCents = 0;
  let tipCents = 0;
  let splits: { userId: string; owedCents: number }[];
  let items: ExpenseWrite["items"] = [];

  try {
    if (request.splitType === "itemized") {
      taxCents = request.taxCents;
      tipCents = request.tipCents;
      items = request.items.map((item) => ({
        name: item.name.trim() || "Item",
        quantity: Math.max(1, item.quantity),
        totalCents: item.totalCents,
        assignments: item.assignments.map((assignment) => ({
          userId: assignment.userId,
          weight: assignment.weight > 0 ? assignment.weight : 1,
        })),
      }));
      const computed = computeItemizedSplits(items, taxCents, tipCents);
      splits = computed.splits;
      amountCents = computed.totalCents;
      if (request.amountCents > 0 && request.amountCents !== amountCents) {
        invalid(
          `items + tax + tip (${formatMoney(amountCents, currency)}) do not match the stated total (${formatMoney(request.amountCents, currency)})`,
        );
      }
    } else {
      amountCents = request.amountCents;
      splits = computeSplits(
        request.splitType,
        amountCents,
        request.splitSpecs.map((spec) => ({
          userId: spec.userId,
          amountCents: spec.amountCents,
          percentBp: spec.percentBp,
          shares: spec.shares,
        })),
      );
    }
  } catch (error) {
    if (error instanceof SplitError) invalid(error.message);
    throw error;
  }

  if (request.payers.length === 0) invalid("at least one payer is required");
  if (request.payers.some((payer) => payer.amountCents <= 0)) {
    invalid("each payer amount must be positive");
  }
  const paidCents = request.payers.reduce((runningTotal, payer) => runningTotal + payer.amountCents, 0);
  if (paidCents !== amountCents) {
    invalid(
      `payments (${formatMoney(paidCents, currency)}) must equal the total (${formatMoney(amountCents, currency)})`,
    );
  }

  // Everyone referenced must exist; in a group, everyone must be a member.
  const involved = [
    ...new Set([...splits.map((split) => split.userId), ...request.payers.map((payer) => payer.userId)]),
  ];
  const users = await findUsersByIds(involved);
  if (users.length !== involved.length) invalid("unknown participant");
  if (groupId) {
    for (const participantId of involved) {
      if (!(await isMember(groupId, participantId))) {
        invalid("all participants must be group members");
      }
    }
  } else if (!involved.includes(userId)) {
    denied("you must be part of a one-off expense");
  }

  return {
    groupId,
    description,
    amountCents,
    currency,
    category: request.category || "general",
    expenseDate: request.expenseDate || new Date().toISOString().slice(0, 10),
    splitType: request.splitType,
    notes: request.notes,
    taxCents,
    tipCents,
    createdBy: userId,
    payers: request.payers.map((payer) => ({ userId: payer.userId, amountCents: payer.amountCents })),
    splits,
    items,
  };
}

/**
 * Collects the distinct ids of everyone participating in an expense (payers + owers).
 *
 * @param write - Validated expense whose participants are collected.
 * @returns Distinct participant user ids.
 */
function involvedUserIds(write: ExpenseWrite): string[] {
  return [
    ...new Set([...write.splits.map((split) => split.userId), ...write.payers.map((payer) => payer.userId)]),
  ];
}

/**
 * Fans out an expense change: one activity entry for the audience (group
 * members, or the participants for one-off expenses) plus a notification for
 * every participant except the actor.
 *
 * @param actorId - User who performed the change.
 * @param expenseId - Id of the affected expense (used for links).
 * @param write - The expense contents used to build the messages.
 * @param verb - Which change happened: "added" | "updated" | "deleted".
 */
async function recordExpenseActivity(
  actorId: string,
  expenseId: string,
  write: ExpenseWrite,
  verb: "added" | "updated" | "deleted",
): Promise<void> {
  const actor = (await findUserById(actorId))!;
  const group = write.groupId ? await findGroupById(write.groupId) : undefined;
  const locationSuffix = group ? ` in "${group.name}"` : "";
  const audience = write.groupId
    ? (await listMembers(write.groupId)).map((member) => member.id)
    : involvedUserIds(write);
  await insertActivity({
    groupId: write.groupId,
    actorId,
    type: `expense_${verb}`,
    message: `${actor.name} ${verb} "${write.description}" (${formatMoney(write.amountCents, write.currency)})${locationSuffix}`,
    link: verb === "deleted" ? (write.groupId ? `/groups/${write.groupId}` : "/friends") : `/expenses/${expenseId}`,
    audience,
  });
  await insertNotifications(
    involvedUserIds(write).filter((recipientId) => recipientId !== actorId),
    {
      type: `expense_${verb}`,
      title: `${actor.name} ${verb} "${write.description}"`,
      body: group ? group.name : "One-off expense",
      link: verb === "deleted" ? "" : `/expenses/${expenseId}`,
    },
  );
}

/**
 * Creates an expense: validates the request, computes authoritative splits,
 * persists everything, auto-friends the participants of a one-off expense,
 * and fans out activity + notifications.
 *
 * @param userId - Authenticated caller creating the expense.
 * @param request - Raw create request from the client.
 * @returns The stored expense as a proto message init shape.
 * @throws UsecaseError on validation, membership, or existence failures.
 */
export async function createExpense(userId: string, request: CreateExpenseRequest) {
  const write = await buildExpenseWrite(userId, request);
  const expenseId = await insertExpense(write);
  // One-off expenses imply a friend connection between all participants.
  if (!write.groupId) {
    for (const participantId of involvedUserIds(write)) {
      if (participantId !== userId) await insertFriendship(userId, participantId);
    }
  }
  await recordExpenseActivity(userId, expenseId, write, "added");
  return getExpenseProto(expenseId);
}

/**
 * Ensures the caller may read an expense: group membership for group
 * expenses, otherwise being a participant (creator, payer, or ower).
 *
 * @param userId - Authenticated caller to authorize.
 * @param expense - The expense row being accessed.
 * @throws UsecaseError (permission_denied) if the caller has no access.
 */
async function assertCanTouch(userId: string, expense: ExpenseRow): Promise<void> {
  if (expense.group_id) {
    if (!(await isMember(expense.group_id, userId))) {
      denied("you are not a member of this group");
    }
    return;
  }
  const children = await loadExpenseChildren([expense.id]);
  const involved = new Set([
    expense.created_by,
    ...(children.payers.get(expense.id) ?? []).map((payer) => payer.user_id),
    ...(children.splits.get(expense.id) ?? []).map((split) => split.user_id),
  ]);
  if (!involved.has(userId)) denied("you are not part of this expense");
}

/**
 * Ensures the caller may MODIFY an expense (edit or delete). Only the
 * expense's creator may modify it — participants can still view. For group
 * expenses the creator must additionally still be a member of the group.
 *
 * @param userId - Authenticated caller requesting the modification.
 * @param expense - The expense row being modified.
 * @throws UsecaseError (permission_denied) if the caller did not create the
 *   expense, or (for group expenses) is no longer a member.
 */
async function assertCanModify(userId: string, expense: ExpenseRow): Promise<void> {
  if (expense.created_by !== userId) {
    denied("only the expense creator can edit or delete it");
  }
  if (expense.group_id && !(await isMember(expense.group_id, userId))) {
    denied("you are no longer a member of this group");
  }
}

/**
 * Replaces an expense with a freshly validated version (original creator is
 * preserved) and fans out an "updated" activity + notifications.
 *
 * @param userId - Authenticated caller performing the update.
 * @param expenseId - Id of the expense to update.
 * @param request - Full replacement request (same shape as create).
 * @returns The updated expense as a proto message init shape.
 * @throws UsecaseError if the expense is missing/deleted, the caller lacks
 *   access, or validation fails.
 */
export async function updateExpense(
  userId: string,
  expenseId: string,
  request: CreateExpenseRequest,
) {
  const existing = await findExpenseById(expenseId);
  if (!existing || existing.deleted_at) notFound("expense not found");
  await assertCanModify(userId, existing);
  const write = await buildExpenseWrite(userId, request);
  write.createdBy = existing.created_by;
  await replaceExpense(expenseId, write);
  await recordExpenseActivity(userId, expenseId, write, "updated");
  return getExpenseProto(expenseId);
}

/**
 * Soft-deletes an expense and fans out a "deleted" activity + notifications
 * built from the expense's stored contents.
 *
 * @param userId - Authenticated caller performing the deletion.
 * @param expenseId - Id of the expense to delete.
 * @throws UsecaseError if the expense is missing/deleted or the caller lacks access.
 */
export async function deleteExpense(userId: string, expenseId: string): Promise<void> {
  const existing = await findExpenseById(expenseId);
  if (!existing || existing.deleted_at) notFound("expense not found");
  await assertCanModify(userId, existing);
  const children = await loadExpenseChildren([expenseId]);
  await softDeleteExpense(expenseId);
  await recordExpenseActivity(
    userId,
    expenseId,
    {
      groupId: existing.group_id,
      description: existing.description,
      amountCents: existing.amount_cents,
      currency: existing.currency,
      category: existing.category,
      expenseDate: existing.expense_date,
      splitType: existing.split_type,
      notes: existing.notes,
      taxCents: existing.tax_cents,
      tipCents: existing.tip_cents,
      createdBy: existing.created_by,
      payers: (children.payers.get(expenseId) ?? []).map((payer) => ({
        userId: payer.user_id,
        amountCents: payer.amount_cents,
      })),
      splits: (children.splits.get(expenseId) ?? []).map((split) => ({
        userId: split.user_id,
        owedCents: split.owed_cents,
      })),
      items: [],
    },
    "deleted",
  );
}

/**
 * Loads the proto user messages for everyone referenced by a set of expenses
 * (creators, payers, owers) so clients can render names/avatars.
 *
 * @param rows - Expense rows whose referenced users are collected.
 * @param children - Batch-loaded child rows for those expenses.
 * @returns Proto user message init shapes for every referenced user.
 */
async function usersReferenced(rows: ExpenseRow[], children: ExpenseChildren) {
  const userIds = new Set<string>();
  for (const expenseRow of rows) {
    userIds.add(expenseRow.created_by);
    for (const payer of children.payers.get(expenseRow.id) ?? []) userIds.add(payer.user_id);
    for (const split of children.splits.get(expenseRow.id) ?? []) userIds.add(split.user_id);
  }
  return (await findUsersByIds([...userIds])).map(toUser);
}

/**
 * Lists expenses visible to the caller: a group's expenses, one-off expenses
 * shared with a specific user, or everything the caller participates in.
 *
 * @param userId - Authenticated caller.
 * @param filter - Optional narrowing: `groupId` for one group, or `withUserId`
 *   for one-off expenses shared with that user; empty ⇒ all of the caller's expenses.
 * @returns The expenses plus the referenced users, as proto message init shapes.
 * @throws UsecaseError (permission_denied) if `groupId` is set and the caller is not a member.
 */
export async function listExpenses(
  userId: string,
  filter: { groupId?: string; withUserId?: string },
) {
  let rows: ExpenseRow[];
  if (filter.groupId) {
    if (!(await isMember(filter.groupId, userId))) {
      denied("you are not a member of this group");
    }
    rows = await listExpensesByGroup(filter.groupId);
  } else if (filter.withUserId) {
    rows = await listOneOffExpensesBetween(userId, filter.withUserId);
  } else {
    rows = await listExpensesInvolvingUser(userId);
  }
  const children = await loadExpenseChildren(rows.map((expenseRow) => expenseRow.id));
  return {
    expenses: rows.map((expenseRow) => toExpense(expenseRow, children)),
    users: await usersReferenced(rows, children),
  };
}

/**
 * Loads an expense (assumed to exist) with its children as a proto message init shape.
 *
 * @param expenseId - Id of the expense to load.
 * @returns The expense proto message init shape.
 */
async function getExpenseProto(expenseId: string) {
  const expenseRow = (await findExpenseById(expenseId))!;
  return toExpense(expenseRow, await loadExpenseChildren([expenseId]));
}

/**
 * Fetches one expense with its comments and every referenced user.
 *
 * @param userId - Authenticated caller; must be allowed to view the expense.
 * @param expenseId - Id of the expense to fetch.
 * @returns The expense, its comments (with authors), and referenced users.
 * @throws UsecaseError if the expense is missing/deleted or the caller lacks access.
 */
export async function getExpense(userId: string, expenseId: string) {
  const expenseRow = await findExpenseById(expenseId);
  if (!expenseRow || expenseRow.deleted_at) notFound("expense not found");
  await assertCanTouch(userId, expenseRow);
  const children = await loadExpenseChildren([expenseId]);
  const comments = await listCommentsByExpense(expenseId);
  const commentAuthors = new Map(
    (await findUsersByIds([...new Set(comments.map((comment) => comment.user_id))])).map((user) => [
      user.id,
      user,
    ]),
  );
  return {
    expense: toExpense(expenseRow, children),
    comments: comments.map((comment) => ({
      id: comment.id,
      expenseId: comment.expense_id,
      author: commentAuthors.get(comment.user_id) ? toUser(commentAuthors.get(comment.user_id)!) : undefined,
      body: comment.body,
      createdAt: comment.created_at,
    })),
    users: await usersReferenced([expenseRow], children),
  };
}

/**
 * Adds a comment to an expense and notifies the other participants.
 *
 * @param userId - Authenticated caller writing the comment.
 * @param expenseId - Id of the expense being commented on.
 * @param body - Comment text; trimmed, must be non-empty.
 * @returns The stored comment (with author) as a proto message init shape.
 * @throws UsecaseError if the expense is missing/deleted, the caller lacks
 *   access, or the comment is empty.
 */
export async function addComment(userId: string, expenseId: string, body: string) {
  const expenseRow = await findExpenseById(expenseId);
  if (!expenseRow || expenseRow.deleted_at) notFound("expense not found");
  await assertCanTouch(userId, expenseRow);
  const trimmed = body.trim();
  if (trimmed.length === 0) invalid("comment cannot be empty");
  const comment = await insertComment(expenseId, userId, trimmed);
  const author = (await findUserById(userId))!;

  const children = await loadExpenseChildren([expenseId]);
  const involved = new Set([
    expenseRow.created_by,
    ...(children.payers.get(expenseId) ?? []).map((payer) => payer.user_id),
    ...(children.splits.get(expenseId) ?? []).map((split) => split.user_id),
  ]);
  await insertNotifications(
    [...involved].filter((recipientId) => recipientId !== userId),
    {
      type: "comment",
      title: `${author.name} commented on "${expenseRow.description}"`,
      body: trimmed.slice(0, 120),
      link: `/expenses/${expenseId}`,
    },
  );
  return {
    id: comment.id,
    expenseId: comment.expense_id,
    author: toUser(author),
    body: comment.body,
    createdAt: comment.created_at,
  };
}

/**
 * Records a real-world payment from the caller to another user (group or
 * one-off), then fans out activity + a notification to the recipient. The
 * settlement's currency follows the group when one is given.
 *
 * @param userId - Authenticated caller who made the payment.
 * @param request - Settlement details: recipient, amount, optional group/currency/method/note.
 * @returns The stored settlement as a proto message init shape.
 * @throws UsecaseError on self-settlement, non-positive amounts, unknown
 *   recipient/group, or missing group membership.
 */
export async function recordSettlement(
  userId: string,
  request: {
    groupId: string;
    toUserId: string;
    amountCents: number;
    currency: string;
    method: string;
    note: string;
  },
) {
  if (request.toUserId === userId) invalid("you cannot settle with yourself");
  if (request.amountCents <= 0) invalid("amount must be positive");
  const recipient = await findUserById(request.toUserId);
  if (!recipient) notFound("recipient not found");

  const groupId = request.groupId || null;
  let currency = request.currency;
  if (groupId) {
    const group = await findGroupById(groupId);
    if (!group) notFound("group not found");
    const [callerIsMember, recipientIsMember] = await Promise.all([
      isMember(groupId, userId),
      isMember(groupId, request.toUserId),
    ]);
    if (!callerIsMember || !recipientIsMember) {
      denied("both people must be members of the group");
    }
    currency = group.currency;
  }
  if (!currency) currency = (await findUserById(userId))?.default_currency ?? "USD";

  // Refuse to record a settlement larger than what the caller actually owes
  // the recipient in this scope — otherwise a user could flip the balance so
  // the recipient now owes them (settlement-as-attack).
  const outstandingCents = await amountOwed(userId, request.toUserId, groupId);
  if (outstandingCents <= 0) {
    invalid("you don't owe this person anything in this scope");
  }
  if (request.amountCents > outstandingCents) {
    invalid(
      `settlement (${formatMoney(request.amountCents, currency)}) exceeds what you owe (${formatMoney(outstandingCents, currency)})`,
    );
  }

  const settlement = await insertSettlement({
    groupId,
    fromUser: userId,
    toUser: request.toUserId,
    amountCents: request.amountCents,
    currency,
    method: request.method || "cash",
    note: request.note,
  });

  const actor = (await findUserById(userId))!;
  const group = groupId ? await findGroupById(groupId) : undefined;
  await insertActivity({
    groupId,
    actorId: userId,
    type: "settlement",
    message: `${actor.name} paid ${recipient.name} ${formatMoney(request.amountCents, currency)}${group ? ` in "${group.name}"` : ""}`,
    link: groupId ? `/groups/${groupId}` : "/friends",
    audience: groupId
      ? (await listMembers(groupId)).map((member) => member.id)
      : [userId, request.toUserId],
  });
  await insertNotifications([request.toUserId], {
    type: "settlement",
    title: `${actor.name} recorded a payment of ${formatMoney(request.amountCents, currency)} to you`,
    body: group ? group.name : "One-off settlement",
    link: groupId ? `/groups/${groupId}` : "/friends",
  });
  return toSettlement(settlement);
}
