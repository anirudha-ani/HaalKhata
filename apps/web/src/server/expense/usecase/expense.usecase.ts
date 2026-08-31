/** Expense business logic: validation + authoritative splits, comments, settlements, activity/notification fan-out. */

import type { CreateExpenseRequest } from "@haalkhata/protogen/expense/v1/expense_pb";
import type { PoolClient } from "pg";
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
import {
  findGroupById,
  isMember,
  listCoMemberIds,
  listGroupsByUser,
  listMembers,
} from "@/server/group/repo/groups.repo";
import { findUserById, findUsersByIds, type UserRow } from "@/server/auth/repo/users.repo";
import { insertFriendship, listFriendIds } from "@/server/social/repo/friendships.repo";
import { insertComment, listCommentsByExpense } from "@/server/expense/repo/comments.repo";
import {
  findSettlementById,
  insertSettlement,
  scopeHasSettlements,
  softDeleteSettlement,
  withSettlementPairLock,
  type SettlementRow,
} from "@/server/expense/repo/settlements.repo";
import { insertActivity, listActivityForExpense } from "@/server/social/repo/activity.repo";
import { insertNotifications } from "@/server/social/repo/notifications.repo";
import {
  computeItemizedSplits,
  computeSplits,
  SplitError,
} from "@haalkhata/shared/expense/splits";
import {
  amountOwed,
  groupCancelsOut,
  oneOffNetsBetween,
  owedByScope,
  userNetInGroup,
  userNetInGroups,
} from "./balance.usecase";
import { allocateSettlement } from "@/server/expense/domain/settlementAllocation";
import { oneOffPairKey, settledExpenseIds } from "@/server/expense/domain/settledExpenses";
import { denied, invalid, notFound } from "@/server/common/errors";
import {
  lockExpenseLedger,
  lockGroupLedgers,
  lockParticipantLedgers,
  withLedgerTransaction,
} from "@/server/common/ledgerLocks";
import { normalizeCurrencyCode } from "@/server/common/validation";
import { beginOperation, finishOperation } from "@/server/common/operations";
import { toPublicUser } from "@/server/auth/usecase/user.mapper";
import {
  COMMENT_PREVIEW_LENGTH,
  EXPENSE_CATEGORIES,
  ISO_DATE_PATTERN,
  MAX_COMMENT_LENGTH,
  MAX_EXPENSE_DESCRIPTION_LENGTH,
  MAX_EXPENSE_ITEM_NAME_LENGTH,
  MAX_EXPENSE_NOTES_LENGTH,
  MAX_EXPENSE_PARTICIPANTS,
  MAX_ITEM_ASSIGNMENTS,
  MAX_MONEY_CENTS,
  MAX_SETTLEMENT_NOTE_LENGTH,
  SETTLEMENT_METHODS,
  SPLIT_TYPES,
  EXPENSE_LIST_DISPLAY_LIMIT,
} from "@/server/expense/expense.constants";
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
  // JavaScript's Date normalises an impossible day instead of rejecting it:
  // 2026-02-31 quietly becomes March 3rd and 2026-02-29 becomes March 1st,
  // both "valid". Only an exact round trip proves the day exists — the
  // check Temporal.PlainDate.from makes for you.
  const parsed = new Date(`${expenseDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== expenseDate) {
    invalid("expense_date is not a real calendar date");
  }
  return expenseDate;
}

/** Group and currency resolved for an expense write. */
interface ExpenseScope {
  groupId: string | null;
  groupMemberIds: Set<string> | null;
  currency: string;
}

/** Authoritative money and split fields computed from an expense request. */
interface ExpenseAmounts {
  amountCents: number;
  taxCents: number;
  tipCents: number;
  splits: ExpenseWrite["splits"];
  items: ExpenseWrite["items"];
}

/**
 * Validates request fields whose rules do not require database access.
 *
 * @param request - Raw expense request from the client.
 * @returns The trimmed, non-empty description.
 */
function validateExpenseRequest(request: CreateExpenseRequest): string {
  const description = request.description.trim();
  if (description.length === 0) invalid("description is required");
  if (description.length > MAX_EXPENSE_DESCRIPTION_LENGTH) {
    invalid(`description is too long (max ${MAX_EXPENSE_DESCRIPTION_LENGTH} characters)`);
  }
  if (request.notes.length > MAX_EXPENSE_NOTES_LENGTH) {
    invalid(`notes are too long (max ${MAX_EXPENSE_NOTES_LENGTH} characters)`);
  }
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
  if (request.items.some((item) => item.assignments.length > MAX_ITEM_ASSIGNMENTS)) {
    invalid(`too many people assigned to one item (max ${MAX_ITEM_ASSIGNMENTS})`);
  }
  if (request.items.some((item) => item.name.trim().length > MAX_EXPENSE_ITEM_NAME_LENGTH)) {
    invalid(`item name is too long (max ${MAX_EXPENSE_ITEM_NAME_LENGTH} characters)`);
  }
  return description;
}

/**
 * Resolves an expense's ledger scope and authoritative currency.
 *
 * @param userId - Authenticated caller creating or updating the expense.
 * @param request - Expense request containing the optional group and currency.
 * @returns The normalized scope, membership snapshot, and currency.
 */
async function resolveExpenseScope(
  userId: string,
  request: CreateExpenseRequest,
): Promise<ExpenseScope> {
  const groupId = request.groupId || null;
  let groupMemberIds: Set<string> | null = null;
  let currency = request.currency;
  if (groupId) {
    const group = await findGroupById(groupId);
    if (!group) notFound("group not found");
    groupMemberIds = new Set((await listMembers(groupId)).map((member) => member.id));
    if (!groupMemberIds.has(userId)) denied("you are not a member of this group");
    currency = group.currency;
  }
  if (!currency) currency = (await findUserById(userId))?.default_currency ?? "USD";
  return { groupId, groupMemberIds, currency: normalizeCurrencyCode(currency) };
}

/**
 * Recomputes all expense amounts and splits from the raw client specification.
 *
 * Client-computed split amounts are never accepted as authoritative. Itemized
 * requests are normalized before the shared cent-exact calculator receives
 * them, and their computed total must match the total stated by the client.
 *
 * @param request - Expense request containing amount and split specifications.
 * @param currency - Normalized currency used in validation messages.
 * @returns Authoritative total, tax, tip, splits, and normalized items.
 */
function computeExpenseAmounts(
  request: CreateExpenseRequest,
  currency: string,
): ExpenseAmounts {
  let amountCents: number;
  let taxCents = 0;
  let tipCents = 0;
  let splits: ExpenseWrite["splits"];
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
      if (amountCents > MAX_MONEY_CENTS) {
        invalid(`amount is too large (max ${MAX_MONEY_CENTS} cents)`);
      }
      if (request.amountCents !== amountCents) {
        invalid(
          `items + tax + tip (${formatMoney(amountCents, currency)}) do not match the stated total (${formatMoney(request.amountCents, currency)})`,
        );
      }
    } else {
      amountCents = request.amountCents;
      if (amountCents > MAX_MONEY_CENTS) {
        invalid(`amount is too large (max ${MAX_MONEY_CENTS} cents)`);
      }
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
  if (splits.length > MAX_EXPENSE_PARTICIPANTS) {
    invalid(`too many participants (max ${MAX_EXPENSE_PARTICIPANTS})`);
  }
  return { amountCents, taxCents, tipCents, splits, items };
}

/**
 * Confirms payer contributions are positive and cover the expense exactly.
 *
 * @param request - Expense request containing payer contributions.
 * @param amountCents - Authoritative total the contributions must cover.
 * @param currency - Currency used in validation messages.
 * @returns Nothing; throws when the contributions are invalid.
 */
function validateExpensePayments(
  request: CreateExpenseRequest,
  amountCents: number,
  currency: string,
): void {
  if (request.payers.some((payer) => payer.amountCents <= 0)) {
    invalid("each payer amount must be positive");
  }
  const paidCents = request.payers.reduce((runningTotal, payer) => runningTotal + payer.amountCents, 0);
  if (paidCents !== amountCents) {
    invalid(
      `payments (${formatMoney(paidCents, currency)}) must equal the total (${formatMoney(amountCents, currency)})`,
    );
  }
}

/**
 * Verifies that every participant exists and may share this ledger with the caller.
 *
 * @param userId - Authenticated caller creating or updating the expense.
 * @param involved - Distinct payer and ower ids referenced by the request.
 * @param scope - Resolved group membership or one-off scope.
 * @returns Nothing once every participant is authorized.
 */
async function validateExpenseParticipants(
  userId: string,
  involved: string[],
  scope: ExpenseScope,
): Promise<void> {
  const users = await findUsersByIds(involved);
  if (users.length !== involved.length) invalid("unknown participant");
  const { groupId, groupMemberIds } = scope;
  if (groupId) {
    for (const participantId of involved) {
      if (!groupMemberIds?.has(participantId)) {
        invalid("all participants must be group members");
      }
    }
  } else {
    if (!involved.includes(userId)) denied("you must be part of a one-off expense");
    const [friendIds, coMemberIds] = await Promise.all([
      listFriendIds(userId),
      listCoMemberIds(userId),
    ]);
    const connectedIds = new Set([...friendIds, ...coMemberIds, userId]);
    if (involved.some((participantId) => !connectedIds.has(participantId))) {
      denied("you can only split with people you already share a friendship or a group with");
    }
  }
}

/**
 * Validates a create/update request and computes the authoritative repo write.
 *
 * The stages deliberately run in validation order: cheap shape checks first,
 * then scope resolution, cent-exact calculation, and participant authorization.
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
  const description = validateExpenseRequest(request);
  const scope = await resolveExpenseScope(userId, request);
  const amounts = computeExpenseAmounts(request, scope.currency);
  validateExpensePayments(request, amounts.amountCents, scope.currency);
  const involved = [
    ...new Set([
      ...amounts.splits.map((split) => split.userId),
      ...request.payers.map((payer) => payer.userId),
    ]),
  ];
  await validateExpenseParticipants(userId, involved, scope);

  return {
    groupId: scope.groupId,
    description,
    amountCents: amounts.amountCents,
    currency: scope.currency,
    category: EXPENSE_CATEGORIES.has(request.category) ? request.category : "general",
    expenseDate: normalizeExpenseDate(request.expenseDate),
    splitType: request.splitType,
    notes: request.notes,
    taxCents: amounts.taxCents,
    tipCents: amounts.tipCents,
    createdBy: userId,
    payers: request.payers.map((payer) => ({ userId: payer.userId, amountCents: payer.amountCents })),
    splits: amounts.splits,
    items: amounts.items,
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
 * Collects the distinct payer and ower ids of one stored expense — the
 * people with money on it, creator not implied.
 *
 * @param expenseId - Expense whose child rows are consulted.
 * @param children - Batch-loaded child rows including that expense.
 * @returns Distinct participant user ids.
 */
function moneyParticipantIds(expenseId: string, children: ExpenseChildren): string[] {
  return [
    ...new Set([
      ...(children.payers.get(expenseId) ?? []).map((payer) => payer.user_id),
      ...(children.splits.get(expenseId) ?? []).map((split) => split.user_id),
    ]),
  ];
}

/**
 * Collects everyone referenced by an already-stored expense.
 *
 * @param expense - Parent expense row.
 * @param children - Child rows loaded for that expense.
 * @returns Distinct creator, payer, and ower ids.
 */
function storedParticipantIds(expense: ExpenseRow, children: ExpenseChildren): string[] {
  return [...new Set([expense.created_by, ...moneyParticipantIds(expense.id, children)])];
}

/**
 * Rechecks group membership after acquiring the group-ledger lock.
 *
 * @param groupId - Locked group scope.
 * @param actorId - Caller creating or replacing the expense.
 * @param participantIds - Everyone whose balance the expense will affect.
 * @param client - Transaction client holding the group-ledger lock.
 * @returns A promise that resolves when every membership is valid.
 */
async function assertLockedGroupParticipants(
  groupId: string,
  actorId: string,
  participantIds: string[],
  client: PoolClient,
): Promise<void> {
  const memberIds = new Set((await listMembers(groupId, client)).map((member) => member.id));
  if (!memberIds.has(actorId)) denied("you are not a member of this group");
  if (participantIds.some((participantId) => !memberIds.has(participantId))) {
    invalid("all participants must be group members");
  }
}


/**
 * Rebuilds the write shape used for deletion activity from stored rows.
 *
 * @param expense - Stored parent row.
 * @param children - Stored child rows.
 * @returns Expense contents suitable for the activity fan-out.
 */
function storedExpenseWrite(expense: ExpenseRow, children: ExpenseChildren): ExpenseWrite {
  return {
    groupId: expense.group_id,
    description: expense.description,
    amountCents: expense.amount_cents,
    currency: expense.currency,
    category: expense.category,
    expenseDate: expense.expense_date,
    splitType: expense.split_type,
    notes: expense.notes,
    taxCents: expense.tax_cents,
    tipCents: expense.tip_cents,
    createdBy: expense.created_by,
    payers: (children.payers.get(expense.id) ?? []).map((payer) => ({
      userId: payer.user_id,
      amountCents: payer.amount_cents,
    })),
    splits: (children.splits.get(expense.id) ?? []).map((split) => ({
      userId: split.user_id,
      owedCents: split.owed_cents,
    })),
    items: [],
  };
}

/**
 * Fans out an expense change: one activity entry for its participants plus a
 * notification for every participant except the actor.
 *
 * @param actorId - User who performed the change.
 * @param expenseId - Id of the affected expense (used for links).
 * @param write - The expense contents used to build the messages.
 * @param verb - Which change happened: "added" | "updated" | "deleted".
 * @param client - The ledger transaction the change is being made in. The
 *   feed event and notifications commit with it, or not at all: an expense
 *   that exists without its announcement, or an announcement of an expense
 *   that rolled back, are both records nobody can reconcile.
 */
async function recordExpenseActivity(
  actorId: string,
  expenseId: string,
  write: ExpenseWrite,
  verb: "added" | "updated" | "deleted",
  client: PoolClient,
): Promise<void> {
  const actor = (await findUserById(actorId))!;
  const group = write.groupId ? await findGroupById(write.groupId, client) : undefined;
  const locationSuffix = group ? ` in "${group.name}"` : "";
  // The participants plus whoever recorded it — never the whole group. A
  // transaction is announced to the people whose money it moved; a member
  // who is not on the expense reads the group's ledger tabs, not a feed
  // line about other people's dinner.
  const audience = [...new Set([...involvedUserIds(write), actorId])];
  await insertActivity(
    {
      groupId: write.groupId,
      actorId,
      type: `expense_${verb}`,
      message: `${actor.name} ${verb} "${write.description}" (${formatMoney(write.amountCents, write.currency)})${locationSuffix}`,
      // A deleted expense still has a page — it stays readable, marked deleted —
      // and the detail view reads this row back as "deleted by X on Y".
      link: `/expenses/${expenseId}`,
      audience,
      amountCents: write.amountCents,
      currency: write.currency,
    },
    client,
  );
  await insertNotifications(
    involvedUserIds(write).filter((recipientId) => recipientId !== actorId),
    {
      type: `expense_${verb}`,
      title: `${actor.name} ${verb} "${write.description}"`,
      body: group ? group.name : "One-off expense",
      link: `/expenses/${expenseId}`,
    },
    client,
  );
}

/**
 * Creates an expense: validates the request, computes authoritative splits,
 * persists everything, auto-friends the participants of a one-off expense,
 * and fans out activity + notifications — all in one transaction, so a
 * failure anywhere leaves nothing behind for a retry to duplicate.
 *
 * @param userId - Authenticated caller creating the expense.
 * @param request - Raw create request from the client.
 * @returns The stored expense as a proto message init shape.
 * @throws UsecaseError on validation, membership, or existence failures.
 */
export async function createExpense(userId: string, request: CreateExpenseRequest) {
  const write = await buildExpenseWrite(userId, request);
  const participantIds = involvedUserIds(write);
  const operation = { userId, rpc: "CreateExpense", operationId: request.operationId ?? "" };
  const expenseId = await withLedgerTransaction(async (client) => {
    // Claimed before any lock: a retry of a lost response resolves here to
    // the expense the first attempt stored, without waiting on ledgers it
    // will not touch.
    const claim = await beginOperation(operation, request, client);
    if (claim.replayOf !== null) return claim.replayOf;
    if (write.groupId) {
      await lockGroupLedgers(client, [write.groupId]);
      await assertLockedGroupParticipants(write.groupId, userId, participantIds, client);
    } else {
      await lockParticipantLedgers(client, participantIds);
    }
    const insertedId = await insertExpense(write, client);
    // One-off expenses imply a friend connection between all participants.
    // Ledger locks first, then the friend-request inbox locks inside
    // insertFriendship — the one order every path takes them in.
    if (!write.groupId) {
      for (const participantId of participantIds) {
        if (participantId !== userId) await insertFriendship(userId, participantId, client);
      }
    }
    await recordExpenseActivity(userId, insertedId, write, "added", client);
    await finishOperation(operation, insertedId, client);
    return insertedId;
  });
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
  if (!storedParticipantIds(expense, children).includes(userId)) {
    denied("you are not part of this expense");
  }
}

/**
 * Ensures the caller may EDIT an expense: anyone on it — its creator, a payer
 * or somebody who owes a share — may correct it, since each of them can see
 * the mistake and each is affected by it. For group expenses the editor must
 * additionally still be a member of the group. Everyone on the expense hears
 * about the edit through the "updated" activity fan-out.
 *
 * @param userId - Authenticated caller requesting the edit.
 * @param expense - The expense row being edited.
 * @param children - Its payer and split rows, which name the participants.
 * @param client - Optional transaction client holding the expense's ledger lock.
 * @throws UsecaseError (permission_denied) if the caller is not on the
 *   expense, or (for group expenses) is no longer a member.
 */
async function assertCanEdit(
  userId: string,
  expense: ExpenseRow,
  children: ExpenseChildren,
  client?: PoolClient,
): Promise<void> {
  if (!storedParticipantIds(expense, children).includes(userId)) {
    denied("only people on this expense can edit it");
  }
  if (expense.group_id && !(await isMember(expense.group_id, userId, client))) {
    denied("you are no longer a member of this group");
  }
}

/**
 * Ensures the caller may DELETE an expense. Deletion stays with the creator:
 * it is the destructive direction, and unlike an edit it leaves nothing
 * behind for the other participants to check. For group expenses the creator
 * must additionally still be a member of the group.
 *
 * @param userId - Authenticated caller requesting the deletion.
 * @param expense - The expense row being deleted.
 * @param client - Optional transaction client holding the expense's ledger lock.
 * @throws UsecaseError (permission_denied) if the caller did not create the
 *   expense, or (for group expenses) is no longer a member.
 */
async function assertCanDelete(
  userId: string,
  expense: ExpenseRow,
  client?: PoolClient,
): Promise<void> {
  if (expense.created_by !== userId) {
    denied("only the expense creator can delete it");
  }
  if (expense.group_id && !(await isMember(expense.group_id, userId, client))) {
    denied("you are no longer a member of this group");
  }
}

/**
 * Replaces an expense with a freshly validated version (original creator is
 * preserved) and fans out an "updated" activity + notifications. Any
 * participant may do this, not just the creator — see {@link assertCanEdit}.
 *
 * Allowed after a settlement in the scope: the edit runs under the ledger
 * lock, so it cannot race the settlement, and the derived balance rebalances
 * against what was already paid — whoever paid more than their corrected
 * share is owed the difference, whoever paid less owes it.
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
  await assertCanEdit(userId, existing, await loadExpenseChildren([expenseId]));
  if ((request.groupId || null) !== existing.group_id) {
    invalid("an expense cannot be moved between groups; delete it and create it in the right group");
  }
  const write = await buildExpenseWrite(userId, request);
  await withLedgerTransaction(async (client) => {
    await lockExpenseLedger(client, expenseId);
    const current = await findExpenseById(expenseId, client);
    if (!current || current.deleted_at) notFound("expense not found");
    const children = await loadExpenseChildren([expenseId], client);
    await assertCanEdit(userId, current, children, client);
    if ((request.groupId || null) !== current.group_id) {
      invalid("an expense cannot be moved between groups; delete it and create it in the right group");
    }
    const participantIds = [
      ...new Set([...storedParticipantIds(current, children), ...involvedUserIds(write)]),
    ];
    if (current.group_id) {
      await lockGroupLedgers(client, [current.group_id]);
      await assertLockedGroupParticipants(
        current.group_id,
        userId,
        involvedUserIds(write),
        client,
      );
    } else {
      await lockParticipantLedgers(client, participantIds);
    }
    write.createdBy = current.created_by;
    await replaceExpense(expenseId, write, client);
    await recordExpenseActivity(userId, expenseId, write, "updated", client);
  });
  return getExpenseProto(expenseId);
}

/**
 * Soft-deletes an expense and fans out a "deleted" activity + notifications
 * built from the expense's stored contents.
 *
 * The row stays: it is returned by list and detail reads marked deleted, so
 * history stays legible, but it contributes nothing to any balance from here
 * on. Payments already recorded against it are not touched — deleting an
 * expense somebody has paid for leaves them owed a refund, and the
 * struck-through row is what explains it. The ledger locks are still taken
 * so the deletion cannot race a settlement being validated against it.
 *
 * @param userId - Authenticated caller performing the deletion.
 * @param expenseId - Id of the expense to delete.
 * @throws UsecaseError if the expense is missing/already deleted or the
 *   caller is not its creator.
 */
export async function deleteExpense(userId: string, expenseId: string): Promise<void> {
  await withLedgerTransaction(async (client) => {
    await lockExpenseLedger(client, expenseId);
    const existing = await findExpenseById(expenseId, client);
    if (!existing || existing.deleted_at) notFound("expense not found");
    await assertCanDelete(userId, existing, client);
    const children = await loadExpenseChildren([expenseId], client);
    const participantIds = storedParticipantIds(existing, children);
    if (existing.group_id) {
      await lockGroupLedgers(client, [existing.group_id]);
    } else {
      await lockParticipantLedgers(client, participantIds);
    }
    await softDeleteExpense(expenseId, userId, client);
    await recordExpenseActivity(
      userId,
      expenseId,
      storedExpenseWrite(existing, children),
      "deleted",
      client,
    );
  });
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
  const userIds = new Set(
    rows.flatMap((expenseRow) => storedParticipantIds(expenseRow, children)),
  );
  return (await findUsersByIds([...userIds])).map(toPublicUser);
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
  // Deleted rows are listed too — struck through on every client — so a
  // payment made against a since-deleted expense keeps the row that explains
  // it. They contribute nothing to the balance math, which reads its own,
  // deleted-excluded queries.
  if (filter.groupId) {
    if (!(await isMember(filter.groupId, userId))) {
      denied("you are not a member of this group");
    }
    rows = await listExpensesByGroup(filter.groupId, undefined, true);
  } else if (filter.withUserId) {
    rows = await listOneOffExpensesBetween(userId, filter.withUserId, undefined, true);
  } else {
    // One past the cap, so the response can say the list is cut without a
    // second count query.
    rows = await listExpensesInvolvingUser(userId, true, EXPENSE_LIST_DISPLAY_LIMIT + 1);
  }
  const truncated = rows.length > EXPENSE_LIST_DISPLAY_LIMIT;
  if (truncated) rows = rows.slice(0, EXPENSE_LIST_DISPLAY_LIMIT);
  const children = await loadExpenseChildren(rows.map((expenseRow) => expenseRow.id));

  // Settledness inputs: the viewer's net per group scope, and per one-off
  // counterparty. Which rows count as settled is decided by the pure
  // settledExpenseIds — this block only gathers the ledger numbers it needs.
  // A deleted expense is never "settled": nothing was pending from it.
  const participants = rows.filter((expenseRow) => !expenseRow.deleted_at).map((expenseRow) => ({
    id: expenseRow.id,
    groupId: expenseRow.group_id ?? "",
    currency: expenseRow.currency,
    participantIds: moneyParticipantIds(expenseRow.id, children),
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
  // One-off slates are per currency, so the settledness lookup is keyed on
  // the counterparty and the expense's currency.
  const oneOffNetByPair = new Map<string, number>();
  await Promise.all(
    counterpartyIds.map(async (counterpartyId) => {
      for (const [currency, cents] of await oneOffNetsBetween(userId, counterpartyId)) {
        oneOffNetByPair.set(oneOffPairKey(counterpartyId, currency), cents);
      }
    }),
  );

  return {
    expenses: rows.map((expenseRow) => toExpense(expenseRow, children)),
    users: await usersReferenced(rows, children),
    settledExpenseIds: settledExpenseIds(
      participants,
      userId,
      viewerNetByGroupId,
      oneOffNetByPair,
    ),
    truncated,
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
 * @returns The expense (deleted ones included, marked by `deletedAt`), its
 *   comments (with authors), and referenced users.
 * @throws UsecaseError if the expense is missing or the caller lacks access.
 */
export async function getExpense(userId: string, expenseId: string) {
  const expenseRow = await findExpenseById(expenseId);
  // A deleted expense still has a page: the feed line that announced the
  // deletion links here, and the row explains any payment left behind.
  if (!expenseRow) notFound("expense not found");
  await assertCanTouch(userId, expenseRow);
  const children = await loadExpenseChildren([expenseId]);
  const comments = await listCommentsByExpense(expenseId);
  // The people to resolve are the comment authors AND whoever touched the
  // expense, looked up together so the history does not cost a second round
  // trip for a set that mostly overlaps.
  const events = await listActivityForExpense(expenseId);
  const peopleById = new Map(
    (
      await findUsersByIds([
        ...new Set([
          ...comments.map((comment) => comment.user_id),
          ...events.map((event) => event.actor_id),
        ]),
      ])
    ).map((user) => [user.id, user]),
  );
  /** Resolves one of those people to the public proto shape; undefined when gone. */
  const publicUserById = (personId: string) => {
    const person = peopleById.get(personId);
    return person ? toPublicUser(person) : undefined;
  };

  // The same settledness rule the expense list applies, for this one expense,
  // so the detail page and the row that linked to it can never disagree.
  const participantIds = moneyParticipantIds(expenseId, children);
  const viewerNetByGroupId = new Map<string, number>();
  if (expenseRow.group_id) {
    viewerNetByGroupId.set(expenseRow.group_id, await userNetInGroup(userId, expenseRow.group_id));
  }
  const oneOffNetByPair = new Map<string, number>();
  if (!expenseRow.group_id) {
    await Promise.all(
      participantIds
        .filter((participantId) => participantId !== userId)
        .map(async (participantId) => {
          for (const [currency, cents] of await oneOffNetsBetween(userId, participantId)) {
            oneOffNetByPair.set(oneOffPairKey(participantId, currency), cents);
          }
        }),
    );
  }
  const settledForViewer =
    settledExpenseIds(
      [
        {
          id: expenseId,
          groupId: expenseRow.group_id ?? "",
          currency: expenseRow.currency,
          participantIds,
        },
      ],
      userId,
      viewerNetByGroupId,
      oneOffNetByPair,
    ).length === 1;

  // Whether a payment postdates this expense in its scope, so the detail view
  // can warn that an edit or a delete will rebalance against it. Advisory
  // only. In a pairwise group only payments between the expense's own
  // participants count — a settlement between two unrelated members says
  // nothing about this expense — while a simplified group routes debt across
  // everyone, so there any later payment might have been for it.
  const scopeGroup = expenseRow.group_id ? await findGroupById(expenseRow.group_id) : undefined;
  const hasLaterSettlement = await scopeHasSettlements(
    expenseRow.group_id,
    storedParticipantIds(expenseRow, children),
    expenseRow.ledger_event_order,
    undefined,
    scopeGroup ? !scopeGroup.simplify_debts : false,
  );

  return {
    settledForViewer,
    hasLaterSettlement,
    expense: toExpense(expenseRow, children),
    comments: comments.map((comment) => ({
      id: comment.id,
      expenseId: comment.expense_id,
      author: publicUserById(comment.user_id),
      body: comment.body,
      createdAt: comment.created_at,
    })),
    users: await usersReferenced([expenseRow], children),
    history: events.map((event) => ({
      actor: publicUserById(event.actor_id),
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
 * @throws UsecaseError if the expense is missing, the caller lacks access, or
 *   the comment is empty.
 */
export async function addComment(userId: string, expenseId: string, body: string) {
  const expenseRow = await findExpenseById(expenseId);
  // Deleted expenses stay open to comments: "why was this removed?" is
  // exactly the conversation the kept row is there to host.
  if (!expenseRow) notFound("expense not found");
  await assertCanTouch(userId, expenseRow);
  const trimmed = body.trim();
  if (trimmed.length === 0) invalid("comment cannot be empty");
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    invalid(`comment is too long (max ${MAX_COMMENT_LENGTH} characters)`);
  }
  const author = (await findUserById(userId))!;
  const preview =
    trimmed.length > COMMENT_PREVIEW_LENGTH
      ? `${trimmed.slice(0, COMMENT_PREVIEW_LENGTH)}…`
      : trimmed;

  // One transaction for the comment and everything that announces it: a
  // comment nobody was told about, or a feed line quoting a comment that was
  // never stored, are both what a retry would then duplicate.
  const comment = await withLedgerTransaction(async (client) => {
    const stored = await insertComment(expenseId, userId, trimmed, client);
    const children = await loadExpenseChildren([expenseId], client);
    const involved = new Set(storedParticipantIds(expenseRow, children));

    // The feed quotes the comment rather than just naming it: "Ani commented on
    // X" tells a reader nothing about whether it is worth opening, and the feed
    // searches over this message, so quoting makes comments findable by content.
    await insertActivity(
      {
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
      },
      client,
    );
    await insertNotifications(
      [...involved].filter((recipientId) => recipientId !== userId),
      {
        type: "comment",
        title: `${author.name} commented on "${expenseRow.description}"`,
        body: preview,
        link: `/expenses/${expenseId}`,
      },
      client,
    );
    return stored;
  });
  return {
    id: comment.id,
    expenseId: comment.expense_id,
    author: toPublicUser(author),
    body: comment.body,
    createdAt: comment.created_at,
  };
}

/** Raw settlement fields accepted from the ExpenseService transport. */
interface SettlementRequest {
  groupId: string;
  toUserId: string;
  amountCents: number;
  currency: string;
  method: string;
  note: string;
  received?: boolean;
  scopeGroupIds?: string[];
  operationId?: string;
}

/** Validated identities and normalized values shared by settlement write stages. */
interface SettlementContext {
  userId: string;
  request: SettlementRequest;
  recipient: UserRow;
  actor: UserRow;
  payerId: string;
  creditorId: string;
  groupId: string | null;
  currency: string;
  method: string;
}

/**
 * Validates a settlement request and resolves its normalized identities,
 * currency, scope, and payment method.
 *
 * @param userId - Authenticated caller recording the payment.
 * @param request - Raw settlement request.
 * @returns Context safe for the locked write and announcement stages.
 */
async function prepareSettlement(
  userId: string,
  request: SettlementRequest,
): Promise<SettlementContext> {
  if (request.toUserId === userId) invalid("you cannot settle with yourself");
  if (request.amountCents <= 0) invalid("amount must be positive");
  if (request.amountCents > MAX_MONEY_CENTS) {
    invalid(`amount is too large (max ${MAX_MONEY_CENTS} cents)`);
  }
  if (request.note.length > MAX_SETTLEMENT_NOTE_LENGTH) {
    invalid(`settlement note is too long (max ${MAX_SETTLEMENT_NOTE_LENGTH} characters)`);
  }
  const recipient = await findUserById(request.toUserId);
  if (!recipient) notFound("recipient not found");

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
    // A group settles only in its own currency; relabelling the requested
    // amount would silently invent an exchange rate.
    const requestedCurrency = request.currency
      ? normalizeCurrencyCode(request.currency)
      : group.currency;
    if (requestedCurrency !== group.currency) {
      invalid(`this group settles in ${group.currency}, not ${requestedCurrency}`);
    }
    currency = group.currency;
  }
  if (!currency) currency = (await findUserById(userId))?.default_currency ?? "USD";
  currency = normalizeCurrencyCode(currency);
  const actor = await findUserById(userId);
  if (!actor) denied("account no longer exists");
  return {
    userId,
    request,
    recipient,
    actor,
    payerId,
    creditorId,
    groupId,
    currency,
    method: SETTLEMENT_METHODS.has(request.method) ? request.method : "cash",
  };
}

/**
 * Stores a payment addressed to one explicit group after rechecking its locked ledger.
 *
 * @param context - Prepared settlement with a non-null group id.
 * @param client - Pair-lock transaction client.
 * @returns The single stored group settlement.
 */
async function storeGroupSettlement(
  context: SettlementContext,
  client: PoolClient,
): Promise<SettlementRow[]> {
  const { userId, request, payerId, creditorId, groupId, currency, method } = context;
  if (!groupId) throw new Error("storeGroupSettlement requires a group id");
  await lockGroupLedgers(client, [groupId]);
  const callerIsMember = await isMember(groupId, userId, client);
  const recipientIsMember = await isMember(groupId, request.toUserId, client);
  if (!callerIsMember || !recipientIsMember) {
    denied("both people must be members of the group");
  }
  // A pairwise loop that nets to zero is not debt. Paying one edge would
  // instead leave the payer owed elsewhere around the loop.
  if (await groupCancelsOut(groupId, client)) {
    invalid(
      "these debts cancel out around a loop — everyone here is settled up overall; turn on Simplify debts to clear the view",
    );
  }
  const outstandingCents = await amountOwed(payerId, creditorId, groupId, client);
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
  return [
    await insertSettlement(
      {
        groupId,
        fromUser: payerId,
        toUser: creditorId,
        amountCents: request.amountCents,
        currency,
        method,
        note: request.note,
        recordedBy: userId,
      },
      client,
    ),
  ];
}

/**
 * Validates a prepared payment against current locked ledgers and stores one
 * settlement row per scope it pays down.
 *
 * @param context - Validated settlement identities and normalized values.
 * @param client - Pair-lock transaction client.
 * @returns Stored rows, with the direct slate first for cross-scope payments.
 */
async function storeSettlementPortions(
  context: SettlementContext,
  client: PoolClient,
): Promise<SettlementRow[]> {
  const { userId, request, payerId, creditorId, groupId, currency, method } = context;
  if (groupId) return storeGroupSettlement(context, client);

  // Lock every group either person belongs to before selecting the shared
  // scopes. That snapshot cannot gain an unlocked group midway through the
  // read-then-write guard.
  const payerGroups = await listGroupsByUser(payerId, client);
  const creditorGroups = await listGroupsByUser(creditorId, client);
  const lockedGroupIds = new Set(
    [...payerGroups, ...creditorGroups].map((group) => group.id),
  );
  await lockGroupLedgers(client, [...lockedGroupIds]);
  const selection = new Set(request.scopeGroupIds ?? []);
  // The client chooses scopes, never amounts. Re-read current server balances
  // so a stale selection cannot double-record a payment.
  const selected = (await owedByScope(payerId, creditorId, client)).filter(
    (scope) =>
      (scope.groupId === null || lockedGroupIds.has(scope.groupId)) &&
      (selection.size === 0 || selection.has(scope.groupId ?? "")),
  );
  const foreign = selected.find(
    (scope) => scope.currency !== currency && selection.has(scope.groupId ?? ""),
  );
  // There is no exchange rate in the request, so an explicitly selected
  // foreign-currency balance must be rejected rather than relabelled.
  if (foreign) {
    invalid(
      `that balance is in ${foreign.currency} — settle it in ${foreign.currency}, not ${currency}`,
    );
  }
  const scopes = selected.filter((scope) => scope.currency === currency);
  const totalOwedCents = scopes.reduce((running, scope) => running + scope.owedCents, 0);
  if (totalOwedCents <= 0) {
    invalid(
      request.received
        ? `this person doesn't owe you anything in the selected ${currency} balances`
        : `you don't owe this person anything in the selected ${currency} balances`,
    );
  }
  if (request.amountCents > totalOwedCents) {
    invalid(
      `settlement (${formatMoney(request.amountCents, currency)}) exceeds what ${
        request.received ? "they owe" : "you owe"
      } there (${formatMoney(totalOwedCents, currency)})`,
    );
  }

  const rows: SettlementRow[] = [];
  for (const portion of allocateSettlement(scopes, request.amountCents)) {
    rows.push(
      await insertSettlement(
        {
          groupId: portion.groupId,
          fromUser: payerId,
          toUser: creditorId,
          amountCents: portion.amountCents,
          currency: portion.currency,
          method,
          note: request.note,
          recordedBy: userId,
        },
        client,
      ),
    );
  }
  return rows;
}

/**
 * Writes activity and the counterparty notification for a stored payment on
 * the payment transaction.
 *
 * @param context - Validated settlement identities and normalized values.
 * @param stored - Settlement portions just inserted.
 * @param client - Pair-lock transaction client.
 */
async function announceSettlement(
  context: SettlementContext,
  stored: SettlementRow[],
  client: PoolClient,
): Promise<void> {
  const { userId, request, recipient, actor, payerId, creditorId, groupId, currency } = context;
  const payerName = request.received ? recipient.name : actor.name;
  const creditorName = request.received ? actor.name : recipient.name;
  const friendLink = `/friends/${request.toUserId}`;
  // Each portion belongs in its own scope's feed, but remains visible only to
  // the payer and recipient rather than every member of a group.
  for (const settlement of stored) {
    const group = settlement.group_id
      ? await findGroupById(settlement.group_id, client)
      : undefined;
    await insertActivity(
      {
        groupId: settlement.group_id,
        // The feed subject is the person who paid. recorded_by still preserves
        // who asserted the payment when the recipient entered it.
        actorId: payerId,
        type: "settlement",
        message: `${payerName} paid ${creditorName} ${formatMoney(settlement.amount_cents, currency)}${group ? ` in "${group.name}"` : ""}${request.received ? ` — recorded by ${actor.name}` : ""}`,
        link: settlement.group_id ? `/groups/${settlement.group_id}` : friendLink,
        audience: [...new Set([payerId, creditorId])],
        amountCents: settlement.amount_cents,
        currency,
        creditUserId: creditorId,
      },
      client,
    );
  }
  const notifyGroup = groupId ? await findGroupById(groupId, client) : undefined;
  await insertNotifications(
    [request.toUserId],
    {
      type: "settlement",
      title: request.received
        ? `${actor.name} recorded your payment of ${formatMoney(request.amountCents, currency)}`
        : `${actor.name} recorded a payment of ${formatMoney(request.amountCents, currency)} to you`,
      body: notifyGroup ? notifyGroup.name : "Settlement",
      link: groupId ? `/groups/${groupId}` : `/friends/${userId}`,
    },
    client,
  );
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
 * All validation and inserts run under a per-pair advisory lock plus every
 * affected group-ledger lock: the over-settle guard is a read followed by
 * writes, and without the locks concurrent settlements or expense changes
 * can both validate against debt that the other operation is replacing.
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
  request: SettlementRequest,
) {
  const context = await prepareSettlement(userId, request);

  // Validation + inserts inside the pair lock, so a concurrent recording of
  // the same real-world payment — from another tab, another device, or the
  // other scope's page — waits here, then re-reads a ledger that already
  // contains this one, and is refused by the guards instead of doubling up.
  // The inserts ride the lock's transaction: portions land atomically, and
  // become visible at the same instant the lock releases — and so do the
  // feed rows and the notification, which commit with the payment or not at
  // all.
  const operation = { userId, rpc: "RecordSettlement", operationId: request.operationId ?? "" };
  const settlements = await withSettlementPairLock(
    context.payerId,
    context.creditorId,
    async (client) => {
      // A retry of a lost response finds the claim the first attempt
      // committed and answers with its recording — never a second one, which
      // the over-settle guard alone could not catch for a partial payment.
      const claim = await beginOperation(operation, request, client);
      if (claim.replayOf !== null) {
        const replayed = await findSettlementById(claim.replayOf, client);
        return replayed ? [replayed] : [];
      }
      const stored = await storeSettlementPortions(context, client);
      await announceSettlement(context, stored, client);
      await finishOperation(operation, stored[0].id, client);
      return stored;
    },
  );
  if (settlements.length === 0) notFound("payment not found");
  return toSettlement(settlements[0]);
}

/**
 * Removes a mistaken payment. Either of the two people on it may — both are
 * affected, and the other one is told. A soft delete: the row keeps its
 * place in the friend ledger, struck through, while every balance ignores it
 * from here on, so the debt it had paid down comes back exactly.
 *
 * Runs under the pair lock plus the group lock, like recording: a settlement
 * being validated against this payment must see it either counted or gone,
 * never half-way.
 *
 * @param userId - Authenticated caller; must be the payer or the recipient.
 * @param settlementId - Id of the settlement to remove.
 * @throws UsecaseError (not_found) when the settlement is missing or already
 *   removed; (permission_denied) when the caller is not on it.
 */
export async function deleteSettlement(userId: string, settlementId: string): Promise<void> {
  const existing = await findSettlementById(settlementId);
  if (!existing || existing.deleted_at) notFound("payment not found");
  if (existing.from_user !== userId && existing.to_user !== userId) {
    denied("only the two people on a payment can remove it");
  }
  const actor = (await findUserById(userId))!;
  const otherUserId = existing.from_user === userId ? existing.to_user : existing.from_user;
  const [payer, creditor] = await Promise.all([
    findUserById(existing.from_user),
    findUserById(existing.to_user),
  ]);
  await withSettlementPairLock(existing.from_user, existing.to_user, async (client) => {
    if (existing.group_id) await lockGroupLedgers(client, [existing.group_id]);
    const current = await findSettlementById(settlementId, client);
    if (!current || current.deleted_at) notFound("payment not found");
    await softDeleteSettlement(settlementId, userId, client);
    // Announced on the same transaction as the removal: the feed row is
    // the only record of who removed it and when, so it cannot be allowed
    // to go missing while the removal stands.
    const group = current.group_id ? await findGroupById(current.group_id, client) : undefined;
    const amount = formatMoney(current.amount_cents, current.currency);
    await insertActivity(
      {
        groupId: current.group_id,
        actorId: userId,
        type: "settlement_deleted",
        message: `${actor.name} removed the payment "${payer?.name ?? "someone"} paid ${creditor?.name ?? "someone"} ${amount}"${group ? ` in "${group.name}"` : ""}`,
        link: current.group_id ? `/groups/${current.group_id}` : `/friends/${otherUserId}`,
        audience: [...new Set([current.from_user, current.to_user])],
        amountCents: current.amount_cents,
        currency: current.currency,
      },
      client,
    );
    await insertNotifications(
      [otherUserId],
      {
        type: "settlement_deleted",
        title: `${actor.name} removed the payment of ${amount}`,
        body: group ? group.name : "Settlement",
        link: current.group_id ? `/groups/${current.group_id}` : `/friends/${userId}`,
      },
      client,
    );
  });
}
