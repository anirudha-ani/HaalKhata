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
import { findGroupById, isMember } from "@/server/group/repo/groups.repo";
import { findUserById, findUsersByIds } from "@/server/auth/repo/users.repo";
import { insertFriendship } from "@/server/social/repo/friendships.repo";
import { insertComment, listCommentsByExpense } from "@/server/expense/repo/comments.repo";
import { insertSettlement, withSettlementPairLock } from "@/server/expense/repo/settlements.repo";
import { insertActivity, listActivityForExpense } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import {
  computeItemizedSplits,
  computeSplits,
  SplitError,
} from "@haalkhata/shared/expense/splits";
import {
  amountOwed,
  oneOffNetBetween,
  owedByScope,
  userNetInGroup,
  userNetInGroups,
} from "./balance.usecase";
import { allocateSettlement } from "@/server/expense/domain/settlementAllocation";
import { settledExpenseIds } from "@/server/expense/domain/settledExpenses";
import { denied, invalid, notFound } from "@/server/common/errors";
import { toUser } from "@/server/auth/usecase/user.mapper";
import { SPLIT_TYPES, ISO_DATE_PATTERN, MAX_EXPENSE_PARTICIPANTS, EXPENSE_CATEGORIES, SETTLEMENT_METHODS, MAX_COMMENT_LENGTH, COMMENT_PREVIEW_LENGTH } from "@/server/expense/expense.constants";
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
 * Validates and normalizes an expense_date input. Returns today's date when
 * empty, or rejects non-YYYY-MM-DD strings so bad input can't reach the DB.
 *
 * @param expenseDate - Raw date string from the request, or empty.
 * @returns A valid YYYY-MM-DD date string.
 * @throws UsecaseError "invalid_argument" when the date is not YYYY-MM-DD.
 */
function normalizeExpenseDate(expenseDate: string): string {
  // Backstop for bare API callers only, and necessarily UTC — the server
  // cannot know the caller's timezone. The forms always send the user's
  // local today (todayISO), so this is not the path a person's "today"
  // takes.
  if (!expenseDate) return new Date().toISOString().slice(0, 10);
  if (!ISO_DATE_PATTERN.test(expenseDate)) {
    invalid("expense_date must be a YYYY-MM-DD string");
  }
  const parsed = new Date(`${expenseDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) invalid("expense_date is not a real calendar date");
  return expenseDate;
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
  if (description.length > 200) invalid("description is too long (max 200 characters)");
  if (!SPLIT_TYPES.has(request.splitType)) invalid(`unknown split type "${request.splitType}"`);

  // Cap input array sizes to bound the per-request SQL fan-out (DoS guard).
  if (request.payers.length === 0 || request.payers.length > MAX_EXPENSE_PARTICIPANTS) {
    invalid(`payers must be between 1 and ${MAX_EXPENSE_PARTICIPANTS}`);
  }
  if (request.splitSpecs.length > MAX_EXPENSE_PARTICIPANTS) {
    invalid(`too many split specs (max ${MAX_EXPENSE_PARTICIPANTS})`);
  }
  if (request.items.length > MAX_EXPENSE_PARTICIPANTS) {
    invalid(`too many line items (max ${MAX_EXPENSE_PARTICIPANTS})`);
  }

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
    category: EXPENSE_CATEGORIES.has(request.category) ? request.category : "general",
    expenseDate: normalizeExpenseDate(request.expenseDate),
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
 * Fans out an expense change: one activity entry for its participants plus a
 * notification for every participant except the actor.
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
  // The participants plus whoever recorded it — never the whole group. A
  // transaction is announced to the people whose money it moved; a member
  // who is not on the expense reads the group's ledger tabs, not a feed
  // line about other people's dinner.
  const audience = [...new Set([...involvedUserIds(write), actorId])];
  await insertActivity({
    groupId: write.groupId,
    actorId,
    type: `expense_${verb}`,
    message: `${actor.name} ${verb} "${write.description}" (${formatMoney(write.amountCents, write.currency)})${locationSuffix}`,
    link: verb === "deleted" ? (write.groupId ? `/groups/${write.groupId}` : "/friends") : `/expenses/${expenseId}`,
    audience,
    amountCents: write.amountCents,
    currency: write.currency,
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

  // Settledness inputs: the viewer's net per group scope, and per one-off
  // counterparty. Which rows count as settled is decided by the pure
  // settledExpenseIds — this block only gathers the ledger numbers it needs.
  const participants = rows.map((expenseRow) => ({
    id: expenseRow.id,
    groupId: expenseRow.group_id ?? "",
    participantIds: [
      ...new Set([
        ...(children.payers.get(expenseRow.id) ?? []).map((payer) => payer.user_id),
        ...(children.splits.get(expenseRow.id) ?? []).map((split) => split.user_id),
      ]),
    ],
  }));
  const groupIds = [
    ...new Set(rows.flatMap((expenseRow) => (expenseRow.group_id ? [expenseRow.group_id] : []))),
  ];
  const counterpartyIds = [
    ...new Set(
      participants
        .filter((expense) => expense.groupId === "")
        .flatMap((expense) => expense.participantIds)
        .filter((participantId) => participantId !== userId),
    ),
  ];
  const viewerNetByGroupId = await userNetInGroups(userId, groupIds);
  const oneOffNetByUserId = new Map<string, number>();
  await Promise.all(
    counterpartyIds.map(async (counterpartyId) => {
      oneOffNetByUserId.set(counterpartyId, await oneOffNetBetween(userId, counterpartyId));
    }),
  );

  return {
    expenses: rows.map((expenseRow) => toExpense(expenseRow, children)),
    users: await usersReferenced(rows, children),
    settledExpenseIds: settledExpenseIds(
      participants,
      userId,
      viewerNetByGroupId,
      oneOffNetByUserId,
    ),
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
  // The people to resolve are the comment authors AND whoever touched the
  // expense, looked up together so the history does not cost a second round
  // trip for a set that mostly overlaps.
  const events = await listActivityForExpense(expenseId);
  const commentAuthors = new Map(
    (
      await findUsersByIds([
        ...new Set([
          ...comments.map((comment) => comment.user_id),
          ...events.map((event) => event.actor_id),
        ]),
      ])
    ).map((user) => [user.id, user]),
  );

  // The same settledness rule the expense list applies, for this one expense,
  // so the detail page and the row that linked to it can never disagree.
  const participantIds = [
    ...new Set([
      ...(children.payers.get(expenseId) ?? []).map((payer) => payer.user_id),
      ...(children.splits.get(expenseId) ?? []).map((split) => split.user_id),
    ]),
  ];
  const viewerNetByGroupId = new Map<string, number>();
  if (expenseRow.group_id) {
    viewerNetByGroupId.set(expenseRow.group_id, await userNetInGroup(userId, expenseRow.group_id));
  }
  const oneOffNetByUserId = new Map<string, number>();
  if (!expenseRow.group_id) {
    await Promise.all(
      participantIds
        .filter((participantId) => participantId !== userId)
        .map(async (participantId) => {
          oneOffNetByUserId.set(participantId, await oneOffNetBetween(userId, participantId));
        }),
    );
  }
  const settledForViewer =
    settledExpenseIds(
      [{ id: expenseId, groupId: expenseRow.group_id ?? "", participantIds }],
      userId,
      viewerNetByGroupId,
      oneOffNetByUserId,
    ).length === 1;

  return {
    settledForViewer,
    expense: toExpense(expenseRow, children),
    comments: comments.map((comment) => ({
      id: comment.id,
      expenseId: comment.expense_id,
      author: commentAuthors.get(comment.user_id) ? toUser(commentAuthors.get(comment.user_id)!) : undefined,
      body: comment.body,
      createdAt: comment.created_at,
    })),
    users: await usersReferenced([expenseRow], children),
    history: events.map((event) => ({
      actor: commentAuthors.get(event.actor_id)
        ? toUser(commentAuthors.get(event.actor_id)!)
        : undefined,
      type: event.type,
      createdAt: event.created_at,
    })),
  };
}

/**
 * Adds a comment to an expense, records it in the activity feed, and notifies
 * the other participants.
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
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    invalid(`comment is too long (max ${MAX_COMMENT_LENGTH} characters)`);
  }
  const comment = await insertComment(expenseId, userId, trimmed);
  const author = (await findUserById(userId))!;

  const children = await loadExpenseChildren([expenseId]);
  const involved = new Set([
    expenseRow.created_by,
    ...(children.payers.get(expenseId) ?? []).map((payer) => payer.user_id),
    ...(children.splits.get(expenseId) ?? []).map((split) => split.user_id),
  ]);
  const preview =
    trimmed.length > COMMENT_PREVIEW_LENGTH
      ? `${trimmed.slice(0, COMMENT_PREVIEW_LENGTH)}…`
      : trimmed;

  // The feed quotes the comment rather than just naming it: "Ani commented on
  // X" tells a reader nothing about whether it is worth opening, and the feed
  // searches over this message, so quoting makes comments findable by content.
  await insertActivity({
    groupId: expenseRow.group_id,
    actorId: userId,
    type: "comment",
    message: `${author.name} commented on "${expenseRow.description}": ${preview}`,
    link: `/expenses/${expenseId}`,
    // The thread follows its transaction: a comment is announced to the
    // expense's participants (and its author, who may be neither payer nor
    // ower) — the same people who saw the expense land in their feeds. A
    // feed line about a conversation on somebody else's expense is noise
    // with a name in it.
    audience: [...new Set([...involved, userId])],
  });
  await insertNotifications(
    [...involved].filter((recipientId) => recipientId !== userId),
    {
      type: "comment",
      title: `${author.name} commented on "${expenseRow.description}"`,
      body: preview,
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
 * Records a real-world payment between the caller and another user, then fans
 * out activity + a notification to the other party.
 *
 * The ledger model this must preserve: every cent of debt lives in exactly
 * one scope — a group, or the pair's one-off ledger — and each scope's
 * balance sees only its own settlement rows. A payment therefore has to be
 * recorded in the scope(s) holding the debt it pays. With a group id the
 * scope is explicit. Without one, the payment is allocated across the scopes
 * where the payer actually owes (one-off first, then largest group debt) and
 * recorded as one row per scope — so paying from the friends tab closes the
 * group's balance too, instead of leaving the group demanding money that
 * already changed hands and double-counting anyone who obliges.
 *
 * All validation and inserts run under a per-pair advisory lock: the
 * over-settle guard is a read followed by writes, and without the lock two
 * concurrent recordings both see the same outstanding debt and both land.
 *
 * `received` says which way the money went. Both directions are needed: a
 * balance in your favour can only be cleared by recording that they paid you.
 *
 * @param userId - Authenticated caller recording the payment.
 * @param request - Settlement details: the other person, amount, direction,
 *   and optional group/currency/method/note.
 * @returns The first stored settlement row as a proto message init shape (a
 *   cross-scope payment stores one row per scope; callers only use this to
 *   confirm the recording).
 * @throws UsecaseError on self-settlement, non-positive amounts, unknown
 *   counterparty/group, missing group membership, or paying more than is owed.
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
    received?: boolean;
    scopeGroupIds?: string[];
  },
) {
  if (request.toUserId === userId) invalid("you cannot settle with yourself");
  if (request.amountCents <= 0) invalid("amount must be positive");
  const recipient = await findUserById(request.toUserId);
  if (!recipient) notFound("recipient not found");
  // Whoever is settling a debt is the payer; the other is the creditor.
  const payerId = request.received ? request.toUserId : userId;
  const creditorId = request.received ? userId : request.toUserId;

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
  const method = SETTLEMENT_METHODS.has(request.method) ? request.method : "cash";

  // Validation + inserts inside the pair lock, so a concurrent recording of
  // the same real-world payment — from another tab, another device, or the
  // other scope's page — waits here, then re-reads a ledger that already
  // contains this one, and is refused by the guards instead of doubling up.
  // The inserts ride the lock's transaction: portions land atomically, and
  // become visible at the same instant the lock releases.
  const settlements = await withSettlementPairLock(payerId, creditorId, async (client) => {
    // Refuse to record more than the debt a payment can actually clear —
    // otherwise it would flip the balance the other way (settlement-as-attack).
    // The cap is what the payer owes in the addressed scope(s), never the
    // pair's net: a debt pointing the other way cannot absorb a payment.
    if (groupId) {
      const outstandingCents = await amountOwed(payerId, creditorId, groupId);
      if (outstandingCents <= 0) {
        invalid(
          request.received
            ? "this person doesn't owe you anything in this group"
            : "you don't owe this person anything in this group",
        );
      }
      if (request.amountCents > outstandingCents) {
        invalid(
          `settlement (${formatMoney(request.amountCents, currency)}) exceeds what ${
            request.received ? "they owe" : "you owe"
          } (${formatMoney(outstandingCents, currency)})`,
        );
      }
      const stored = await insertSettlement(
        {
          groupId,
          fromUser: payerId,
          toUser: creditorId,
          amountCents: request.amountCents,
          currency,
          method,
          note: request.note,
        },
        client,
      );
      return [stored];
    }

    // The payer picked which balances this payment addresses ("" names the
    // one-off ledger); an empty selection means all of them. Filtering what
    // is actually owed by the selection — rather than trusting the client's
    // amounts — keeps the guards authoritative: a stale checkbox for a
    // balance someone else just settled contributes nothing here, and the
    // refusal below says so instead of double-recording.
    const selection = new Set(request.scopeGroupIds ?? []);
    const scopes = (await owedByScope(payerId, creditorId)).filter(
      (scope) => selection.size === 0 || selection.has(scope.groupId ?? ""),
    );
    const totalOwedCents = scopes.reduce((running, scope) => running + scope.owedCents, 0);
    if (totalOwedCents <= 0) {
      invalid(
        request.received
          ? "this person doesn't owe you anything in the selected balances"
          : "you don't owe this person anything in the selected balances",
      );
    }
    if (request.amountCents > totalOwedCents) {
      invalid(
        `settlement (${formatMoney(request.amountCents, currency)}) exceeds what ${
          request.received ? "they owe" : "you owe"
        } there (${formatMoney(totalOwedCents, currency)})`,
      );
    }
    const rows = [];
    for (const portion of allocateSettlement(scopes, request.amountCents)) {
      rows.push(
        await insertSettlement(
          {
            groupId: portion.groupId,
            fromUser: payerId,
            toUser: creditorId,
            amountCents: portion.amountCents,
            currency,
            method,
            note: request.note,
          },
          client,
        ),
      );
    }
    return rows;
  });

  const actor = (await findUserById(userId))!;
  // The feed states who actually paid whom, not who typed it in — otherwise a
  // payment received reads as one made.
  const payerName = request.received ? recipient.name : actor.name;
  const creditorName = request.received ? actor.name : recipient.name;
  const friendLink = `/friends/${request.toUserId}`;
  // One feed row per portion, each in its own scope's voice: the slice that
  // paid down a group says so and carries that group's id, so it files under
  // the group's activity tab for the two people it concerns. Every slice
  // stays between the pair — a payment is the payer's and the receiver's
  // line, not the room's.
  for (const settlement of settlements) {
    const group = settlement.group_id ? await findGroupById(settlement.group_id) : undefined;
    await insertActivity({
      groupId: settlement.group_id,
      // The payer, not whoever typed it in. A feed row's avatar restates the
      // subject of its own sentence, and for a settlement that subject is the
      // person who paid — the message right below already names them first.
      // Recording a payment received put the recorder's face beside "someone
      // else paid me", which reads as though they had paid themselves.
      //
      // Every other activity type has actor and subject as the same person, so
      // this is the only place they can diverge. Who entered it is not lost:
      // the notification below says "<name> recorded your payment".
      actorId: payerId,
      type: "settlement",
      message: `${payerName} paid ${creditorName} ${formatMoney(settlement.amount_cents, currency)}${group ? ` in "${group.name}"` : ""}`,
      link: settlement.group_id ? `/groups/${settlement.group_id}` : friendLink,
      // The pair, never the room: if you are A, "B paid C" is B and C's
      // feed line. The recorder is always one of the two.
      audience: [...new Set([payerId, creditorId])],
      amountCents: settlement.amount_cents,
      currency,
      // Who received the money, so each reader's feed can say whether it came
      // to them — the same row is inbound for one party and outbound for the other.
      creditUserId: creditorId,
    });
  }
  // One notification for the whole payment, whatever it was split across —
  // the other party was paid once and should be told once.
  const notifyGroup = groupId ? await findGroupById(groupId) : undefined;
  await insertNotifications([request.toUserId], {
    type: "settlement",
    title: request.received
      ? `${actor.name} recorded your payment of ${formatMoney(request.amountCents, currency)}`
      : `${actor.name} recorded a payment of ${formatMoney(request.amountCents, currency)} to you`,
    body: notifyGroup ? notifyGroup.name : "Settlement",
    link: groupId ? `/groups/${groupId}` : `/friends/${userId}`,
  });
  return toSettlement(settlements[0]);
}
