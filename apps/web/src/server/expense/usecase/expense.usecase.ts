/** Expense business logic: validation + authoritative splits, comments, settlements, activity/notification fan-out. */

import { canPreserveSplitType } from "@haalkhata/shared/expense/form/preserveSplit";
import { blockedPairExists } from "@/server/safety/repo/safety.repo";
import { assertSafeText } from "@/server/safety/usecase/contentFilter";
import { isRegisteredUser } from "@/server/auth/usecase/identity/user.mapper";
import { ExpenseListPart, type CreateExpenseRequest } from "@haalkhata/protogen/expense/v1/expense_pb";
import type { PlainNumbers } from "@haalkhata/shared/api/wireNumbers";
import type { PoolClient } from "pg";
import {
  findExpenseById,
  insertExpense,
  listExpensePage,
  loadExpenseChildren,
  replaceExpense,
  softDeleteExpense,
  type ExpenseChildren,
  type ExpenseListKey,
  type ExpenseListScope,
  type ExpenseRow,
  type ExpenseWrite,
} from "@/server/expense/repo/expenses.repo";
import {
  findGroupById,
  findGroupsByIds,
  isMember,
  listCoMemberIds,
  listMembers,
  type GroupRow,
} from "@/server/group/repo/groups.repo";
import { assertGroupActive, assertGroupsActive } from "@/server/group/usecase/groupArchive";
import { GROUP_STATUS_PROTO } from "@/server/group/group.constants";
import { GroupStatus } from "@haalkhata/protogen/group/v1/group_pb";
import { findUserById, findUsersByIds, type UserRow } from "@/server/auth/repo/users.repo";
import { insertFriendships, listFriendIds } from "@/server/social/repo/friendships.repo";
import {
  findCommentById,
  insertComment,
  listCommentPage,
  listCommentsByExpense,
  type CommentKey,
  type CommentRow,
} from "@/server/expense/repo/comments.repo";
import {
  findSettlementById,
  insertNetSettlement,
  insertSettlement,
  listSettlementsByNetSettlement,
  softDeleteNetSettlement,
  scopeHasSettlements,
  softDeleteSettlement,
  lockSettlementPair,
  withSettlementPairLock,
  type SettlementRow,
} from "@/server/expense/repo/settlements.repo";
import { insertActivity, listActivityForExpense } from "@/server/social/repo/activity.repo";
import { insertNotificationRows, insertNotifications } from "@/server/social/repo/notifications.repo";
import {
  computeItemizedSplits,
  computeSplits,
  computeUnclaimedSplits,
  payerWeights,
  SplitError,
} from "@haalkhata/shared/expense/splits";
import {
  assignUnclaimedLines,
  bumpExpenseVersion,
  deleteUnsharedPeople,
  findRunningLiveSplit,
  isInLiveSplit,
  listJoinedSinceLastSave,
  listLiveSplitPeople,
  markLiveSplitChanged,
  markLiveSplitFinished,
  markLiveSplitSaved,
  type LiveSplitRow,
} from "@/server/expense/repo/liveSplits.repo";
import { revokeLiveSplitLink } from "@/server/social/repo/inviteLinks.repo";
import { liveSessionOf, openLiveSession } from "./liveSplit/liveSession";
import {
  expenseStateOf,
  sameExpense,
  type ExpenseState,
  type ExpenseStateSource,
} from "@haalkhata/shared/expense/merge/expenseState";
import { mergeExpenseEdit } from "@haalkhata/shared/expense/merge/mergeExpenseEdit";
import { EDIT_CONFLICT_MESSAGE } from "@haalkhata/shared/expense/merge/merge.constants";
import {
  amountOwed,
  groupCancelsOut,
  oneOffNetsWith,
  owedByScope,
  pairScopeDebts,
  sharedActiveGroups,
  userNetInGroup,
  userNetInGroups,
} from "./balance.usecase";
import {
  allocateSettlement,
  planNetSettlement,
  positionDigest,
} from "@/server/expense/domain/settlementAllocation";
import { groupScopeKey, oneOffPairKey, settledExpenseIds } from "@/server/expense/domain/settledExpenses";
import { readerShareLine, removedReaderLine } from "@/server/expense/domain/readerShareLine";
import { expenseNetChanges, type PaidAndOwed } from "@/server/expense/domain/balances";
import {
  decodeCursor,
  encodeCursor,
  isCursorValue,
  isExactTimestamp,
  pageSize,
} from "@/server/common/pagination/pagination";
import { STALE_CURSOR_MESSAGE } from "@/server/common/pagination/pagination.constants";
import { snapshot } from "@/server/common/db/db";
import { UsecaseError, denied, invalid, notFound } from "@/server/common/errors";
import {
  lockExpenseLedger,
  lockGroupLedgers,
  lockParticipantLedgers,
  withLedgerTransaction,
} from "@/server/common/ledger/ledgerLocks";
import { isRealCalendarDate, normalizeCurrencyCode } from "@/server/common/validation/validation";
import { beginOperation, finishedOperationResult, finishOperation, operationClaimed } from "@/server/common/ledger/operations";
import type { OperationKey } from "@/server/common/ledger/operations.repo";
import { toPublicUser } from "@/server/auth/usecase/identity/user.mapper";
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
  DUPLICATE_PAYER_MESSAGE,
  MAX_MONEY_CENTS,
  NET_SETTLEMENT_TOO_LARGE_MESSAGE,
  MAX_SETTLEMENT_NOTE_LENGTH,
  OFFSET_ACTIVITY_TYPE,
  OFFSET_SETTLEMENT_METHOD,
  SETTLEMENT_METHODS,
  SPLIT_TYPES,
  EXPENSE_LIST_DISPLAY_LIMIT,
  COMMENT_PAGE_SIZE,
  EXPENSE_PAGE_SIZE,
  MAX_COMMENT_PAGE_SIZE,
  MAX_EXPENSE_PAGE_SIZE,
  ONE_OFF_NOT_CONNECTED_MESSAGE,
  SETTLEMENT_ATTEMPTS,
  currencyChangeRefusal,
  formerMemberRefusal,
} from "@/server/expense/expense.constants";
import { toExpense, toSettlement } from "./expense.mapper";
import { assertRoomInLedgers } from "./volumeLimit";
import { findPaymentMethod } from "@/server/payment/repo/paymentMethods.repo";
import { cleanMethodRow } from "@/server/payment/usecase/paymentMethod.mapper";
import { centsToInput, formatMoney as displayMoney } from "@haalkhata/shared/money/money";
import { settlementMethodKey } from "@haalkhata/shared/payment/payeeMethods";

/**
 * Formats an amount for human-readable messages, e.g. "USD 12.50".
 *
 * The amount is in the currency's own minor unit, so it is written with
 * that currency's number of decimals: 7000 is "JPY 7000", not "JPY 70.00",
 * and 12500 is "KWD 12.500".
 *
 * @param cents - Amount in the currency's minor units.
 * @param currency - Currency code to prefix the amount with.
 * @returns The formatted amount string.
 */
function formatMoney(cents: number, currency: string): string {
  return `${currency} ${centsToInput(cents, currency)}`;
}

/**
 * Refuses an amount past the most one expense, share or payment can be,
 * written the way the screens write money so a figure that long is
 * readable.
 *
 * @param currency - Currency the ceiling is written in.
 * @throws UsecaseError (invalid_argument), always.
 */
function refuseTooLarge(currency: string): never {
  invalid(`amount is too large (the most one amount can be is ${displayMoney(MAX_MONEY_CENTS, currency)})`);
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
  if (!isRealCalendarDate(expenseDate)) invalid("expense_date is not a real calendar date");
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
 * An expense as a client sends it to be created or saved, with its money in
 * plain numbers (plainService converts the wire's 64-bit integers).
 */
export type ExpenseInput = PlainNumbers<CreateExpenseRequest>;

/**
 * Validates request fields whose rules do not require database access.
 *
 * @param request - Raw expense request from the client.
 * @returns The trimmed, non-empty description.
 */
function validateExpenseRequest(request: ExpenseInput): string {
  assertSafeText(request.description);
  assertSafeText(request.notes);
  for (const item of request.items) assertSafeText(item.name);
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
  request: ExpenseInput,
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
 * @param allowUnclaimed - Whether a line may have nobody on it: only while a
 *   live split runs, when it counts against whoever paid.
 * @returns Authoritative total, tax, tip, splits, and normalized items.
 */
function computeExpenseAmounts(
  request: ExpenseInput,
  currency: string,
  allowUnclaimed: boolean,
): ExpenseAmounts {
  let amountCents: number;
  let taxCents = 0;
  let tipCents = 0;
  let splits: ExpenseWrite["splits"];
  let items: ExpenseWrite["items"] = [];

  // Every figure the client states is checked before any is added up, so
  // no sum below can pass 2^53 and come out rounded.
  const stated = [
    request.amountCents,
    request.taxCents,
    request.tipCents,
    ...request.items.map((item) => item.totalCents),
    ...request.payers.map((payer) => payer.amountCents),
    ...request.splitSpecs.map((spec) => spec.amountCents),
  ];
  if (stated.some((cents) => cents > MAX_MONEY_CENTS)) refuseTooLarge(currency);

  try {
    if (request.splitType === "itemized") {
      taxCents = request.taxCents;
      tipCents = request.tipCents;
      items = request.items.map((item) => ({
        id: item.id,
        name: item.name.trim() || "Item",
        quantity: Math.max(1, item.quantity),
        totalCents: item.totalCents,
        assignments: item.assignments.map((assignment) => ({
          userId: assignment.userId,
          weight: assignment.weight > 0 ? assignment.weight : 1,
        })),
      }));
      const computed = allowUnclaimed
        ? computeUnclaimedSplits(items, taxCents, tipCents, request.payers)
        : computeItemizedSplits(items, taxCents, tipCents);
      splits = computed.splits;
      amountCents = computed.totalCents;
      if (amountCents > MAX_MONEY_CENTS) refuseTooLarge(currency);
      if (request.amountCents !== amountCents) {
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
  request: ExpenseInput,
  amountCents: number,
  currency: string,
): void {
  if (request.payers.some((payer) => payer.amountCents <= 0)) {
    invalid("each payer amount must be positive");
  }
  if (new Set(request.payers.map((payer) => payer.userId)).size !== request.payers.length) {
    invalid(DUPLICATE_PAYER_MESSAGE);
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
 * @param existingIds - For an edit, the people on the expense as saved.
 * @param livePeople - Everyone a running live split has brought to this
 *   expense, who may share it whoever is saving; null when none is running.
 * @param payerIds - Who paid.
 * @returns Nothing once every participant is authorized.
 */
async function validateExpenseParticipants(
  userId: string,
  involved: string[],
  scope: ExpenseScope,
  existingIds: string[] = [],
  livePeople: readonly string[] | null = null,
  payerIds: readonly string[] = [],
): Promise<void> {
  const users = await findUsersByIds(involved);
  if (users.length !== involved.length) invalid("unknown participant");
  // Only somebody who can sign in joins an expense. The one row that cannot
  // is the Deleted member a deleted account leaves behind: it keeps its shares
  // in the expenses it is already on, which stay editable, and joins no others.
  const alreadyOnIt = new Set(existingIds);
  const unregistered = users.find(
    (participant) => !isRegisteredUser(participant) && !alreadyOnIt.has(participant.id),
  );
  if (unregistered) {
    invalid(`${unregistered.name} can't be added to a new expense`);
  }
  if (await blockedPairExists([...new Set([...involved, userId])], existingIds)) denied("a blocked person cannot be included in this expense");
  const { groupId, groupMemberIds } = scope;
  if (groupId) {
    for (const participantId of involved) {
      if (!groupMemberIds?.has(participantId)) {
        invalid("all participants must be group members");
      }
    }
  } else {
    if (!livePeople && !involved.includes(userId)) denied("you must be part of a one-off expense");
    await assertConnectedToExpense(userId, involved, { existingIds, payerIds, livePeople: livePeople ?? [] });
  }
}

/**
 * Refuses a one-off expense with somebody on it who has no business being
 * there. Everyone must be connected to whoever is saving it, or be on it
 * already and connected to somebody who paid: their debt runs to the payer,
 * not to the editor, so two people who met over a shared bill can each
 * still correct it, while a payer who has removed a friend cannot put them
 * back in debt. Nobody's own deleted account makes a bill uneditable.
 *
 * @param actorId - Who is saving it.
 * @param participantIds - Everyone the write puts on the expense.
 * @param expense - Who is on it as saved, who paid, and who a running live
 *   split has brought to it.
 * @param client - Transaction client, for the re-check under the ledger locks.
 * @throws UsecaseError (permission_denied) when anyone is not connected.
 */
async function assertConnectedToExpense(
  actorId: string,
  participantIds: readonly string[],
  expense: { existingIds: readonly string[]; payerIds: readonly string[]; livePeople: readonly string[] },
  client?: PoolClient,
): Promise<void> {
  const connectedIds = new Set([...(await connectedUserIds(actorId, client)), ...expense.livePeople]);
  const strangers = participantIds.filter((participantId) => !connectedIds.has(participantId));
  if (strangers.length === 0) return;
  const alreadyOn = new Set(expense.existingIds);
  if (strangers.some((participantId) => !alreadyOn.has(participantId))) {
    denied(ONE_OFF_NOT_CONNECTED_MESSAGE);
  }
  // A Deleted member has no connections left. It stays on the bills it was on,
  // and a debt that runs only to one runs to nobody who could have removed anyone.
  const people = await findUsersByIds([...strangers, ...expense.payerIds], client);
  const deletedIds = new Set(people.filter((person) => !isRegisteredUser(person)).map((person) => person.id));
  const livingPayerIds = expense.payerIds.filter((payerId) => !deletedIds.has(payerId));
  if (expense.payerIds.length > 0 && livingPayerIds.length === 0) return;
  const connectedToPayers = new Set<string>();
  for (const payerId of livingPayerIds) {
    for (const connectedId of await connectedUserIds(payerId, client)) connectedToPayers.add(connectedId);
  }
  if (strangers.some((participantId) => !deletedIds.has(participantId) && !connectedToPayers.has(participantId))) {
    denied(ONE_OFF_NOT_CONNECTED_MESSAGE);
  }
}

/**
 * Everyone a caller may share a one-off expense with: their friends, the
 * people they share a group with, and themselves.
 *
 * @param userId - The caller.
 * @param client - Transaction client, for the re-check under the ledger locks.
 * @returns The connected user ids, the caller included.
 */
async function connectedUserIds(userId: string, client?: PoolClient): Promise<Set<string>> {
  const friendIds = await listFriendIds(userId, client);
  const coMemberIds = await listCoMemberIds(userId, client);
  return new Set([...friendIds, ...coMemberIds, userId]);
}

/**
 * Re-checks, under the participant ledger locks, that the caller is still
 * connected to everyone on a one-off expense. The check in
 * {@link validateExpenseParticipants} ran before this request waited for the
 * locks, and a friend removal holding them meanwhile must not be undone by
 * a write already in flight: it would put the removed friend into debt and
 * re-create the friendship.
 *
 * @param actorId - Authenticated caller writing the expense.
 * @param participantIds - Everyone the write puts on the expense.
 * @param client - The write's transaction, holding the participant locks.
 * @param expense - Who is on it as saved, who paid, and who a running live
 *   split has brought to it; omitted for a new expense.
 * @throws UsecaseError (permission_denied) when anyone is no longer connected.
 */
async function assertLockedOneOffParticipants(
  actorId: string,
  participantIds: string[],
  client: PoolClient,
  expense: { existingIds: readonly string[]; payerIds: readonly string[]; livePeople: readonly string[] } = {
    existingIds: [],
    payerIds: [],
    livePeople: [],
  },
): Promise<void> {
  await assertConnectedToExpense(actorId, participantIds, expense, client);
}

/**
 * What a bill opened to the table before anything is on it comes to: nothing,
 * with everyone the form named on it.
 *
 * @param userId - Who opened it.
 * @param request - The form as it stood.
 * @returns The amounts to save.
 */
function emptyBillAmounts(userId: string, request: ExpenseInput): ExpenseAmounts {
  const people = new Set([userId, ...request.splitSpecs.map((spec) => spec.userId), ...request.payers.map((payer) => payer.userId)]);
  return {
    amountCents: 0,
    taxCents: 0,
    tipCents: 0,
    splits: [...people].map((personId) => ({ userId: personId, owedCents: 0 })),
    items: [],
  };
}

/**
 * Validates a create/update request and computes the authoritative repo write.
 *
 * The stages deliberately run in validation order: cheap shape checks first,
 * then scope resolution, cent-exact calculation, and participant authorization.
 *
 * @param userId - Authenticated caller creating or updating the expense.
 * @param request - Raw expense request from the client.
 * @param existingIds - For an edit, the people on the expense as saved.
 * @param savedCurrency - For an edit, the currency the expense was saved in.
 *   It is kept, group expenses included, and a request naming another is
 *   refused: its amounts were typed in that other currency's units.
 * @param live - What a live split changes: whether a line may have nobody on
 *   it, who it has brought to the expense (null when none is running), and
 *   whether a bill just opened may have nothing on it yet.
 * @returns A fully validated `ExpenseWrite` ready for the repo layer.
 * @throws UsecaseError (invalid_argument / not_found / permission_denied) on
 *   any validation, existence, or membership failure; (failed_precondition)
 *   on an edit that names a currency other than the saved one.
 */
async function buildExpenseWrite(
  userId: string,
  request: ExpenseInput,
  existingIds: string[] = [],
  savedCurrency?: string,
  live: { allowUnclaimed: boolean; people: readonly string[] | null; allowEmpty?: boolean } = { allowUnclaimed: false, people: null },
): Promise<ExpenseWrite> {
  const description = validateExpenseRequest(request);
  if (savedCurrency !== undefined && request.currency.trim() !== "" && normalizeCurrencyCode(request.currency) !== savedCurrency) {
    throw new UsecaseError("failed_precondition", currencyChangeRefusal(savedCurrency));
  }
  const resolvedScope = await resolveExpenseScope(userId, request);
  const scope = savedCurrency === undefined ? resolvedScope : { ...resolvedScope, currency: savedCurrency };
  const isEmptyBill = live.allowEmpty === true && request.amountCents === 0;
  const amounts = isEmptyBill
    ? emptyBillAmounts(userId, request)
    : computeExpenseAmounts(request, scope.currency, live.allowUnclaimed);
  if (!isEmptyBill) validateExpensePayments(request, amounts.amountCents, scope.currency);
  const involved = [
    ...new Set([
      ...amounts.splits.map((split) => split.userId),
      ...request.payers.map((payer) => payer.userId),
    ]),
  ];
  await validateExpenseParticipants(
    userId,
    involved,
    scope,
    existingIds,
    live.people,
    request.payers.map((payer) => payer.userId),
  );

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
    // An empty bill is nothing yet, whatever the request says anybody paid.
    payers: isEmptyBill
      ? [...new Set(request.payers.map((payer) => payer.userId))].map((payerId) => ({ userId: payerId, amountCents: 0 }))
      : request.payers.map((payer) => ({ userId: payer.userId, amountCents: payer.amountCents })),
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
export function moneyParticipantIds(expenseId: string, children: ExpenseChildren): string[] {
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
export function storedParticipantIds(expense: ExpenseRow, children: ExpenseChildren): string[] {
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
  await assertGroupActive(groupId, client);
  if (participantIds.some((participantId) => !memberIds.has(participantId))) {
    invalid("all participants must be group members");
  }
}

/**
 * Refuses a change that would move a former member's balance in a group.
 * Leaving needs a zero balance there, and nobody can record a group payment
 * with someone who has left, so a removed payment or a changed expense under
 * them would leave a debt nobody can clear. Changes between
 * people who are still members, and changes that leave a former member at
 * zero, are not affected.
 *
 * @param groupId - The group whose ledger is changing.
 * @param changeByUser - How much each person's net in that group moves, in cents.
 * @param actorId - Who is making the change, addressed as "you" when they are the one who left.
 * @param client - Transaction client holding the group's ledger lock.
 * @throws UsecaseError (failed_precondition) naming a former member whose balance would move.
 */
async function assertFormerMembersUnmoved(
  groupId: string,
  changeByUser: Map<string, number>,
  actorId: string,
  client: PoolClient,
): Promise<void> {
  const movedIds = [...changeByUser].filter(([, cents]) => cents !== 0).map(([userId]) => userId);
  if (movedIds.length === 0) return;
  const memberIds = new Set((await listMembers(groupId, client)).map((member) => member.id));
  const formerId = movedIds.find((userId) => !memberIds.has(userId));
  if (formerId === undefined) return;
  const [former] = await findUsersByIds([formerId], client);
  const group = await findGroupById(groupId, client);
  throw new UsecaseError(
    "failed_precondition",
    formerMemberRefusal(
      group?.name ?? "this group",
      formerId === actorId ? undefined : (former?.name ?? "A former member"),
    ),
  );
}

/**
 * Why editing or deleting a group expense would be refused because somebody
 * on it has left the group: the rule {@link assertFormerMembersUnmoved}
 * enforces, worked out for the detail view so it can say so in place of the
 * buttons rather than send a request that fails. Editing is refused while
 * anyone on the expense has left, since an edit may name only members;
 * deleting, only when it would move a former member's balance.
 *
 * @param group - The expense's group.
 * @param expenseId - The expense.
 * @param children - Its child rows, from the same snapshot.
 * @param viewerId - Who is reading, addressed as "you" when they are the one who left.
 * @param client - The snapshot's client.
 * @returns Both refusals; "" where the action would go through.
 */
async function formerMemberRefusals(
  group: { id: string; name: string },
  expenseId: string,
  children: ExpenseChildren,
  viewerId: string,
  client: PoolClient,
): Promise<{ editRefusal: string; deleteRefusal: string }> {
  const memberIds = new Set((await listMembers(group.id, client)).map((member) => member.id));
  const formerIds = moneyParticipantIds(expenseId, children).filter(
    (participantId) => !memberIds.has(participantId),
  );
  if (formerIds.length === 0) return { editRefusal: "", deleteRefusal: "" };
  const nameById = new Map(
    (await findUsersByIds(formerIds, client)).map((former) => [former.id, former.name] as const),
  );
  const refusalFor = (formerId: string, refused?: string) =>
    formerMemberRefusal(
      group.name,
      formerId === viewerId ? undefined : (nameById.get(formerId) ?? "A former member"),
      refused,
    );
  const deletionMoves = expenseNetChanges(storedAmounts(expenseId, children), { payers: [], splits: [] });
  const movedFormerId = formerIds.find((formerId) => deletionMoves.has(formerId));
  // Deleting still works when it would leave everyone who left at zero, so
  // the edit refusal says only what it refuses.
  return movedFormerId === undefined
    ? { editRefusal: refusalFor(formerIds[0], "this expense can't be edited"), deleteRefusal: "" }
    : { editRefusal: refusalFor(movedFormerId), deleteRefusal: refusalFor(movedFormerId) };
}

/**
 * The stored payers and shares of one expense, for {@link expenseNetChanges}.
 *
 * @param expenseId - The expense.
 * @param children - Its child rows, loaded under the expense lock.
 * @returns Who paid and who owes, in cents.
 */
function storedAmounts(expenseId: string, children: ExpenseChildren): PaidAndOwed {
  return {
    payers: (children.payers.get(expenseId) ?? []).map((payer) => ({
      userId: payer.user_id,
      amountCents: payer.amount_cents,
    })),
    splits: (children.splits.get(expenseId) ?? []).map((split) => ({
      userId: split.user_id,
      amountCents: split.owed_cents,
    })),
  };
}

/**
 * The payers and shares a validated write will store, for {@link expenseNetChanges}.
 *
 * @param write - The authoritative write.
 * @returns Who will have paid and who will owe, in cents.
 */
function writtenAmounts(write: ExpenseWrite): PaidAndOwed {
  return {
    payers: write.payers.map((payer) => ({ userId: payer.userId, amountCents: payer.amountCents })),
    splits: write.splits.map((split) => ({ userId: split.userId, amountCents: split.owedCents })),
  };
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
    items: (children.items.get(expense.id) ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      totalCents: item.total_cents,
      assignments: item.assignments.map((assignment) => ({
        userId: assignment.user_id,
        weight: assignment.weight,
      })),
    })),
  };
}

/**
 * An even split of an amount.
 *
 * @param amountCents - The amount.
 * @param userIds - Who shares it, in order.
 * @returns Each person's share.
 */
function evenSplits(amountCents: number, userIds: readonly string[]): ExpenseWrite["splits"] {
  return computeSplits("equal", amountCents, userIds.map((userId) => ({ userId, amountCents: 0, percentBp: 0, shares: 0 })));
}

/**
 * Keeps everyone who has joined a live split on the expense. Somebody can be on
 * it with nothing to pay, and a save that gives them no share must not take them
 * off: they are still at the table. A form that had not seen somebody join could
 * not have ticked them, so an even split counts them here, as it would have.
 *
 * @param write - The write about to be saved.
 * @param peopleIds - Who is in the split.
 * @param base - The expense as the form saw it, when it says.
 */
function keepJoinersOn(write: ExpenseWrite, peopleIds: readonly string[], base: ExpenseStateSource | undefined): void {
  const seenIds = new Set(base ? base.splits.map((split) => split.userId) : peopleIds);
  const unseenIds = peopleIds.filter((userId) => !seenIds.has(userId));
  if (write.splitType === "equal" && write.amountCents > 0 && unseenIds.length > 0) {
    const sharingIds = write.splits.filter((split) => split.owedCents > 0).map((split) => split.userId);
    write.splits = evenSplits(write.amountCents, [...new Set([...sharingIds, ...unseenIds])]);
  }
  const listed = new Set(write.splits.map((split) => split.userId));
  for (const userId of peopleIds) {
    if (!listed.has(userId)) write.splits.push({ userId, owedCents: 0 });
  }
}

/**
 * Puts a merged expense back in the shape the repo writes.
 *
 * @param write - The write it came from, which keeps its scope.
 * @param merged - The merged expense.
 * @returns The write to save.
 */
function writeFromState(write: ExpenseWrite, merged: ExpenseState): ExpenseWrite {
  return {
    ...write,
    description: merged.description,
    category: merged.category,
    expenseDate: merged.expenseDate,
    notes: merged.notes,
    splitType: merged.splitType,
    amountCents: merged.amountCents,
    taxCents: merged.taxCents,
    tipCents: merged.tipCents,
    payers: Object.entries(merged.payers).map(([userId, amountCents]) => ({ userId, amountCents })),
    splits: Object.entries(merged.owed).map(([userId, owedCents]) => ({ userId, owedCents })),
    items: merged.lines.map((line) => ({
      id: line.id,
      name: line.name,
      quantity: line.quantity,
      totalCents: line.totalCents,
      assignments: Object.entries(line.shares).map(([userId, weight]) => ({ userId, weight })),
    })),
  };
}

/**
 * Fans out an expense change: one activity entry for its participants plus a
 * notification for every participant except the actor, each carrying that
 * reader's own money line.
 *
 * An edit also reaches everyone it took off the expense: their
 * balance moved too, and their notification says what they no longer owe or
 * get back. Off a group expense they can still open it, so they are in the
 * feed line as well. Off a one-off expense they cannot, so their
 * notification links to their page with the editor instead, and the feed
 * line, one link for everyone, stays with the people still on it.
 *
 * @param actorId - User who performed the change.
 * @param expenseId - Id of the affected expense (used for links).
 * @param write - The expense contents used to build the messages.
 * @param verb - Which change happened: "added" | "updated" | "deleted".
 * @param client - The ledger transaction the change is being made in. The
 *   feed event and notifications commit with it, or not at all: an expense
 *   that exists without its announcement, or an announcement of an expense
 *   that rolled back, are both records nobody can reconcile.
 * @param before - For an edit, the expense as it was, to find who it took off.
 */
async function recordExpenseActivity(
  actorId: string,
  expenseId: string,
  write: ExpenseWrite,
  verb: "added" | "updated" | "deleted",
  client: PoolClient,
  before?: ExpenseWrite,
): Promise<void> {
  // Found even if they have no account any more: a live split's end is
  // announced for whoever started it, who may have deleted theirs since.
  const [actor] = await findUsersByIds([actorId], client);
  const group = write.groupId ? await findGroupById(write.groupId, client) : undefined;
  const locationSuffix = group ? ` in "${group.name}"` : "";
  const participantIds = involvedUserIds(write);
  const stillOn = new Set(participantIds);
  const removedIds = before
    ? involvedUserIds(before).filter((participantId) => !stillOn.has(participantId))
    : [];
  const takenOff = new Set(removedIds);
  // The participants plus whoever recorded it — never the whole group. A
  // transaction is announced to the people whose money it moved; a member
  // who is not on the expense reads the group's ledger tabs, not a feed
  // line about other people's dinner.
  const audience = [...new Set([...participantIds, ...(write.groupId ? removedIds : []), actorId])];
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
  // Each reader's bell row (and so their push) says what the expense means
  // for them: "Goa trip · you owe Ani ৳600". One row per reader, because the
  // money line is theirs alone, written in one statement while the ledger
  // lock is held.
  const payerIds = [
    ...new Set([...write.payers, ...(before?.payers ?? [])].map((payer) => payer.userId)),
  ];
  const payerNames = new Map(
    (await findUsersByIds(payerIds, client)).map((payer) => [payer.id, payer.name] as const),
  );
  const scopeName = group ? group.name : "One-off expense";
  await insertNotificationRows(
    [...participantIds, ...removedIds]
      .filter((participantId) => participantId !== actorId)
      .map((recipientId) => {
        const removed = before !== undefined && takenOff.has(recipientId);
        const moneyLine = removed
          ? removedReaderLine(before, recipientId, payerNames)
          : readerShareLine(write, recipientId, verb, payerNames);
        return {
          userId: recipientId,
          actorId,
          type: `expense_${verb}`,
          title: `${actor.name} ${verb} "${write.description}"`,
          body: moneyLine ? `${scopeName} · ${moneyLine}` : scopeName,
          link: removed && !write.groupId ? `/friends/${actorId}` : `/expenses/${expenseId}`,
        };
      }),
    client,
  );
}

/**
 * Creates an expense: validates the request, computes authoritative splits,
 * persists everything, auto-friends the participants of a one-off expense,
 * and fans out activity + notifications — all in one transaction, so a
 * failure anywhere leaves nothing behind for a retry to duplicate.
 *
 * Asked to start a live split, it opens one with the expense, whose lines may
 * then have nobody on them yet, and says nothing to anyone: the split's end
 * announces the expense once, with everyone's real share.
 *
 * @param userId - Authenticated caller creating the expense.
 * @param request - Raw create request from the client.
 * @returns The stored expense as a proto message init shape.
 * @throws UsecaseError on validation, membership, or existence failures.
 */
export async function createExpense(userId: string, request: ExpenseInput) {
  const write = await buildExpenseWrite(userId, request, [], undefined, {
    allowUnclaimed: request.startLiveSplit,
    people: request.startLiveSplit ? [userId] : null,
    allowEmpty: request.startLiveSplit,
  });
  const participantIds = involvedUserIds(write);
  const operation = { userId, rpc: "CreateExpense", operationId: request.operationId ?? "" };
  const expenseId = await withLedgerTransaction(async (client) => {
    // Claimed before any lock: a retry of a lost response resolves here to
    // the expense the first attempt stored, without waiting on ledgers it
    // will not touch.
    const claim = await beginOperation(operation, request, client);
    if (claim.replayOf !== null) return claim.replayOf;
    // A saved operation still replays after archiving. Only a new write
    // needs the active-state check, under the ledger lock below.
    if (write.groupId) {
      await lockGroupLedgers(client, [write.groupId]);
      await assertLockedGroupParticipants(write.groupId, userId, participantIds, client);
    } else {
      await lockParticipantLedgers(client, participantIds);
      await assertLockedOneOffParticipants(userId, participantIds, client);
    }
    await assertRoomInLedgers(
      { currency: write.currency, amountCents: write.amountCents, participantIds },
      userId,
      client,
    );
    const insertedId = await insertExpense(write, client);
    // A one-off expense befriends its creator with everyone on it. Ledger
    // locks first, then the friend-request inbox locks inside
    // insertFriendships — the one order every path takes them in.
    if (!write.groupId) await insertFriendships(userId, participantIds, client);
    if (request.startLiveSplit) await openLiveSession(insertedId, userId, true, client);
    else await recordExpenseActivity(userId, insertedId, write, "added", client);
    await finishOperation(operation, insertedId, client);
    return insertedId;
  });
  return getExpenseProto(expenseId);
}

/**
 * Ensures the caller may read an expense: group membership for group
 * expenses, otherwise being a participant (creator, payer, or ower) or in a
 * live split running on it.
 *
 * @param userId - Authenticated caller to authorize.
 * @param expense - The expense row being accessed.
 * @throws UsecaseError (permission_denied) if the caller has no access.
 */
export async function assertCanTouch(userId: string, expense: ExpenseRow): Promise<void> {
  if (expense.group_id) {
    if (!(await isMember(expense.group_id, userId))) {
      denied("you are not a member of this group");
    }
    return;
  }
  const children = await loadExpenseChildren([expense.id]);
  if (storedParticipantIds(expense, children).includes(userId)) return;
  if (!(await isInLiveSplit(expense.id, userId))) denied("you are not part of this expense");
}

/**
 * Ensures the caller may EDIT an expense: anyone on it — its creator, a payer
 * or somebody who owes a share — may correct it, since each of them can see
 * the mistake and each is affected by it, and so may anyone in a live split
 * running on it. For group expenses the editor must additionally still be a
 * member of the group. Everyone on the expense hears about the edit through
 * the "updated" activity fan-out.
 *
 * @param userId - Authenticated caller requesting the edit.
 * @param expense - The expense row being edited.
 * @param children - Its payer and split rows, which name the participants.
 * @param client - Optional transaction client holding the expense's ledger lock.
 * @throws UsecaseError (permission_denied) if the caller is not on the
 *   expense, or (for group expenses) is no longer a member.
 */
export async function assertCanEdit(
  userId: string,
  expense: ExpenseRow,
  children: ExpenseChildren,
  client?: PoolClient,
): Promise<void> {
  const onExpense = storedParticipantIds(expense, children).includes(userId);
  if (!onExpense && !(await isInLiveSplit(expense.id, userId, client))) {
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
 * Loads an expense for editing and applies every check a replacement must
 * pass: it exists and is not deleted, the caller may edit it, and the
 * request does not try to move it between groups.
 *
 * Runs twice per update on purpose: once before the expensive request
 * validation, so a doomed edit fails fast without taking ledger locks, and
 * once more on the locked transaction client, because everything checked
 * here can change between the first look and the lock.
 *
 * @param userId - Authenticated caller requesting the edit.
 * @param expenseId - Expense being replaced.
 * @param request - The replacement, whose group must match the stored one.
 * @param client - Transaction client holding the expense's ledger lock;
 *   omitted for the pre-lock fast path.
 * @returns The stored expense row and its child rows.
 * @throws UsecaseError when any of the checks fails.
 */
async function loadExpenseForEdit(
  userId: string,
  expenseId: string,
  request: ExpenseInput,
  client?: PoolClient,
): Promise<{ expense: ExpenseRow; children: ExpenseChildren }> {
  const expense = await findExpenseById(expenseId, client);
  if (!expense || expense.deleted_at) notFound("expense not found");
  const children = await loadExpenseChildren([expenseId], client);
  await assertCanEdit(userId, expense, children, client);
  if ((request.groupId || null) !== expense.group_id) {
    invalid("an expense cannot be moved between groups; delete it and create it in the right group");
  }
  return { expense, children };
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
 * The expense keeps the currency it was saved in. An edit naming another —
 * an app from before the forms kept it, or a hand-made request — is refused
 * rather than relabelling the debt: BDT 5,000 must never become USD 5,000.
 *
 * Several people can edit at once. Under the expense's lock, what this person
 * changed since `base` goes on top of the expense as it stands now, part by
 * part ({@link mergeExpenseEdit}), and only a part two people changed to
 * different values stops the save. Nothing in the edit is saved then; the app
 * reads the latest and asks. An app that sends no `base` replaces the whole
 * expense, as every app used to.
 *
 * A retry of a lost response neither saves nor announces the edit a second
 * time, and an edit that changes nothing is not saved or announced at all.
 *
 * While a live split runs nothing is announced: everyone is there, and each
 * tick would buzz the whole table. Its end says it once.
 *
 * @param userId - Authenticated caller performing the update.
 * @param expenseId - Id of the expense to update.
 * @param request - Full replacement request (same shape as create).
 * @param preserveSplitType - Retain an existing ratio mode only for identical allocations.
 * @param base - The expense as this person's form opened it.
 * @returns The updated expense as a proto message init shape.
 * @throws UsecaseError if the expense is missing/deleted, the caller lacks
 *   access, validation fails, or (aborted) somebody else changed the same thing.
 */
export async function updateExpense(
  userId: string,
  expenseId: string,
  request: ExpenseInput,
  preserveSplitType = false,
  base?: ExpenseStateSource,
) {
  const existing = await loadExpenseForEdit(userId, expenseId, request);
  const existingIds = storedParticipantIds(existing.expense, existing.children);
  const open = await findRunningLiveSplit(expenseId);
  const mine = await buildExpenseWrite(userId, request, existingIds, existing.expense.currency, {
    allowUnclaimed: open !== undefined,
    people: open ? [...(await listLiveSplitPeople(open.id)), ...existingIds] : null,
  });
  const operation = { userId, rpc: "UpdateExpense", operationId: request.operationId ?? "" };
  await withLedgerTransaction(async (client) => {
    // Claimed before any lock, like every money write: a retry of a lost
    // response resolves here without waiting on ledgers it will not touch.
    const claim = await beginOperation(operation, { expenseId, request, preserveSplitType, base }, client);
    if (claim.replayOf !== null) return;
    await lockExpenseLedger(client, expenseId);
    const running = await findRunningLiveSplit(expenseId, client);
    if (running?.due) await closeLiveSplit(running, client);
    const session = await liveSessionOf(expenseId, client);
    const { expense: current, children } = await loadExpenseForEdit(
      userId,
      expenseId,
      request,
      client,
    );
    const stored = storedExpenseWrite(current, children);
    const write = base ? mergedWrite(base, mine, stored, session !== null) : mine;
    if (session) keepJoinersOn(write, session.peopleIds, base);
    if (sameExpense(expenseStateOf(write), expenseStateOf(stored))) {
      // Saving nothing new is still saying they are done, and their avatar says so.
      if (session) {
        await markLiveSplitSaved(session.split.id, userId, client);
        await bumpExpenseVersion(expenseId, client);
      }
      await finishOperation(operation, expenseId, client);
      return;
    }
    const savedLineIds = new Set((children.items.get(expenseId) ?? []).map((item) => item.id));
    write.items = write.items.map((item) => ({
      ...item,
      id: item.id && savedLineIds.has(item.id) ? item.id : undefined,
    }));
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
      await assertFormerMembersUnmoved(
        current.group_id,
        expenseNetChanges(storedAmounts(expenseId, children), writtenAmounts(write)),
        userId,
        client,
      );
    } else {
      await lockParticipantLedgers(client, participantIds);
      await assertLockedOneOffParticipants(userId, involvedUserIds(write), client, {
        existingIds: storedParticipantIds(current, children),
        payerIds: write.payers.map((payer) => payer.userId),
        // connectPayersToBill connects whoever starts paying with everyone on it.
        livePeople: session ? [...session.peopleIds, ...storedParticipantIds(current, children)] : [],
      });
    }
    // A merge has already kept the saved mode of a split nobody changed.
    if (preserveSplitType && !base) {
      const saved = {
        splitType: current.split_type,
        amountCents: current.amount_cents,
        currency: current.currency,
        groupId: current.group_id ?? "",
        splits: (children.splits.get(expenseId) ?? []).map((split) => ({
          userId: split.user_id,
          owedCents: split.owed_cents,
        })),
      };
      if (!canPreserveSplitType(saved, { ...write, groupId: write.groupId ?? "" })) {
        throw new UsecaseError("failed_precondition", "The saved split changed. Reload the expense before editing it.");
      }
      write.splitType = current.split_type;
    }
    await assertRoomInLedgers(
      { currency: write.currency, amountCents: write.amountCents, participantIds: involvedUserIds(write) },
      userId,
      client,
      {
        id: expenseId,
        currency: current.currency,
        amountCents: current.amount_cents,
        participantIds: moneyParticipantIds(expenseId, children),
      },
    );
    write.createdBy = current.created_by;
    await replaceExpense(expenseId, write, userId, client);
    if (session && !current.group_id) await connectPayersToBill(write, stored, client);
    if (session) {
      await markLiveSplitChanged(session.split.id, client);
      await markLiveSplitSaved(session.split.id, userId, client);
    } else {
      await recordExpenseActivity(userId, expenseId, write, "updated", client, stored);
    }
    await finishOperation(operation, expenseId, client);
  });
  return getExpenseProto(expenseId);
}

/**
 * Befriends whoever paid with everyone on a one-off bill, once a live split
 * has changed who that is. People who met over the bill owe each other from
 * the moment somebody adds their card, and a friendship is what lets them
 * settle it, then or whenever they get to it. Taps that bring in nobody new
 * cost nothing here.
 *
 * @param write - The expense as saved.
 * @param stored - The expense as it was.
 * @param client - The transaction, holding these people's ledger locks.
 */
async function connectPayersToBill(write: ExpenseWrite, stored: ExpenseWrite, client: PoolClient): Promise<void> {
  const involvedBefore = new Set(involvedUserIds(stored));
  const paidBefore = new Set(stored.payers.map((payer) => payer.userId));
  const involved = involvedUserIds(write);
  const payerIds = write.payers.map((payer) => payer.userId);
  if (involved.every((userId) => involvedBefore.has(userId)) && payerIds.every((userId) => paidBefore.has(userId))) return;
  for (const payerId of payerIds) await insertFriendships(payerId, involved, client);
}

/**
 * Applies what this person changed to the expense as it stands now.
 *
 * @param base - The expense as their form opened it.
 * @param mine - Their edit, validated.
 * @param stored - The expense as saved, read under its lock.
 * @param live - Whether a live split is running: a line may end up with
 *   nobody on it, and what each person paid follows the total.
 * @returns The write to save.
 * @throws UsecaseError (aborted) when somebody else changed the same thing.
 */
function mergedWrite(
  base: ExpenseStateSource,
  mine: ExpenseWrite,
  stored: ExpenseWrite,
  live: boolean,
): ExpenseWrite {
  const { merged, conflicts } = mergeExpenseEdit(
    expenseStateOf(base),
    expenseStateOf(mine),
    expenseStateOf(stored),
    { live },
  );
  if (conflicts.length > 0) throw new UsecaseError("aborted", EDIT_CONFLICT_MESSAGE);
  const paidCents = Object.values(merged.payers).reduce((total, cents) => total + cents, 0);
  if (paidCents !== merged.amountCents) throw new UsecaseError("aborted", EDIT_CONFLICT_MESSAGE);
  return writeFromState(mine, merged);
}

/**
 * Gives a share of an evenly split bill to whoever joined after the last save.
 * Their form never got to count them, and joining is how you say you are on
 * the bill. Only somebody the join put on the bill counts: whoever started the
 * split need not be on it, and somebody at no share who joined before a save
 * was taken off it, so they stay off. It holds to everything a save would: a
 * group that has been archived, or a former member whose balance this would
 * move, leaves the bill as it is, as does a ledger with no room, or the split
 * could never end.
 *
 * @param split - The split.
 * @param expense - Its expense.
 * @param client - The transaction, holding the expense's lock.
 */
async function countLateJoiners(split: LiveSplitRow, expense: ExpenseRow, client: PoolClient): Promise<void> {
  if (expense.split_type !== "equal" || expense.deleted_at) return;
  const children = await loadExpenseChildren([expense.id], client);
  const stored = storedExpenseWrite(expense, children);
  const sharingIds = stored.splits.filter((share) => share.owedCents > 0).map((share) => share.userId);
  const unsharedIds = new Set(stored.splits.filter((share) => share.owedCents === 0).map((share) => share.userId));
  const lateIds = (await listJoinedSinceLastSave(split.id, client)).filter((userId) => unsharedIds.has(userId));
  if (lateIds.length === 0) return;
  const counted = { ...stored, splits: evenSplits(expense.amount_cents, [...sharingIds, ...lateIds]) };
  const participantIds = [...new Set([...involvedUserIds(stored), ...lateIds])];
  try {
    if (expense.group_id) {
      await lockGroupLedgers(client, [expense.group_id]);
      await assertGroupActive(expense.group_id, client);
      await assertFormerMembersUnmoved(
        expense.group_id,
        expenseNetChanges(storedAmounts(expense.id, children), writtenAmounts(counted)),
        split.host_id,
        client,
      );
    } else {
      await lockParticipantLedgers(client, participantIds);
    }
    await assertRoomInLedgers({ currency: expense.currency, amountCents: expense.amount_cents, participantIds }, split.host_id, client);
  } catch (refusal) {
    if (refusal instanceof UsecaseError) return;
    throw refusal;
  }
  await replaceExpense(expense.id, counted, split.host_id, client);
}

/**
 * Ends a live split, inside the caller's transaction, which holds the
 * expense's lock. Whoever joined since the last save is counted on an evenly
 * split bill, and lines nobody claimed go to whoever paid for good, leaving an
 * ordinary expense with only people who have something to pay. One nobody ever
 * filled in is removed. Otherwise everyone on it hears the result once, unless
 * the split changed nothing or the expense has been deleted.
 *
 * @param split - The split.
 * @param client - The transaction.
 */
export async function closeLiveSplit(split: LiveSplitRow, client: PoolClient): Promise<void> {
  const opened = (await findExpenseById(split.expense_id, client))!;
  if (opened.amount_cents > 0) {
    await countLateJoiners(split, opened, client);
    const payers = (await loadExpenseChildren([split.expense_id], client)).payers.get(split.expense_id) ?? [];
    await assignUnclaimedLines(
      split.expense_id,
      payerWeights(payers.map((payer) => ({ userId: payer.user_id, amountCents: payer.amount_cents }))),
      client,
    );
  }
  await deleteUnsharedPeople(split.expense_id, client);
  await markLiveSplitFinished(split.id, client);
  await revokeLiveSplitLink(split.id, client);
  await bumpExpenseVersion(split.expense_id, client);
  const expense = (await findExpenseById(split.expense_id, client))!;
  if (expense.deleted_at) return;
  // Opened and never filled in: there is no bill here to keep or announce.
  if (expense.amount_cents === 0) {
    await softDeleteExpense(split.expense_id, split.host_id, client);
    return;
  }
  if (!(split.new_expense || split.changed)) return;
  const children = await loadExpenseChildren([split.expense_id], client);
  await recordExpenseActivity(
    split.host_id,
    split.expense_id,
    storedExpenseWrite(expense, children),
    split.new_expense ? "added" : "updated",
    client,
  );
}

/**
 * Whether anyone has saved a change to an expense: what an open edit form
 * asks on a timer, so it costs one small read rather than the whole expense.
 *
 * @param userId - Authenticated caller; must be allowed to view the expense.
 * @param expenseId - Id of the expense.
 * @returns Its version.
 * @throws UsecaseError if the expense is missing or the caller lacks access.
 */
export async function getExpenseVersion(userId: string, expenseId: string) {
  const expense = await findExpenseById(expenseId);
  if (!expense) notFound("expense not found");
  await assertCanTouch(userId, expense);
  return { version: expense.version };
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
      await assertCanDelete(userId, existing, client);
      await assertGroupActive(existing.group_id, client);
      await assertFormerMembersUnmoved(
        existing.group_id,
        expenseNetChanges(storedAmounts(expenseId, children), { payers: [], splits: [] }),
        userId,
        client,
      );
    } else {
      await lockParticipantLedgers(client, participantIds);
    }
    await softDeleteExpense(expenseId, userId, client);
    const running = await findRunningLiveSplit(expenseId, client);
    if (running) await closeLiveSplit(running, client);
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
    rows.flatMap((expenseRow) => [
      ...storedParticipantIds(expenseRow, children),
      ...(expenseRow.updated_by ? [expenseRow.updated_by] : []),
    ]),
  );
  return (await findUsersByIds([...userIds])).map(toPublicUser);
}

/**
 * Lists expenses visible to the caller, one page at a time, newest first: a
 * group's expenses, one-off expenses shared with a specific user, or
 * everything the caller participates in.
 *
 * Paged by keyset (date, time written, id), so expenses added while someone
 * pages cannot shift the window. A request without a limit gets the one
 * page of up to {@link EXPENSE_LIST_DISPLAY_LIMIT} with `truncated`, the
 * shape app versions from before paging read.
 *
 * @param userId - Authenticated caller.
 * @param filter - Optional narrowing: `groupId` for one group, or `withUserId`
 *   for one-off expenses shared with that user; empty ⇒ the caller's own
 *   expenses, all of them or the `part` named (one-off, or one group's).
 * @param page - The previous page's cursor ("" for the first) and the page size (0 for the old single page).
 * @returns The page's expenses, the users they reference, which are settled,
 *   and the cursor for the next page ("" at the oldest).
 * @throws UsecaseError (permission_denied) if `groupId` is set and the caller is not a member;
 *   (invalid_argument) for a cursor that is not one of this list's, or a
 *   `part` that does not fit the rest of the filter.
 */
export async function listExpenses(
  userId: string,
  filter: { groupId?: string; withUserId?: string; part?: ExpenseListPart; partGroupId?: string },
  page: { cursor: string; limit: number },
) {
  const part = filter.part ?? ExpenseListPart.UNSPECIFIED;
  if (!Object.values(ExpenseListPart).includes(part)) invalid("unknown part of the expense list");
  if (part !== ExpenseListPart.UNSPECIFIED && (filter.groupId || filter.withUserId)) {
    invalid("a part of your own list cannot be combined with a group or a person");
  }
  if ((part === ExpenseListPart.GROUP) !== Boolean(filter.partGroupId)) {
    invalid("name the group exactly when reading one group's part of your list");
  }
  if (filter.groupId && !(await isMember(filter.groupId, userId))) {
    denied("you are not a member of this group");
  }
  // One instant for the whole list. Each row is assembled from several
  // statements — the expense, who paid, who owes, its items — and the
  // "settled" marks from balances read after them; an edit or a payment
  // committing in between would pair one expense's amount with another
  // version's shares, or mark a row against a ledger it was not listed from.
  const legacy = page.limit <= 0;
  const size = legacy
    ? EXPENSE_LIST_DISPLAY_LIMIT
    : pageSize(page.limit, EXPENSE_PAGE_SIZE, MAX_EXPENSE_PAGE_SIZE);
  const after = page.cursor ? decodeExpenseListCursor(page.cursor) : null;
  const listed = await snapshot(async (client) => {
    // Deleted rows are listed too — struck through on every client — so a
    // payment made against a since-deleted expense keeps the row that explains
    // it. They contribute nothing to the balance math, which reads its own,
    // deleted-excluded queries. One row past the page says whether there is
    // another, without a count query.
    const scope: ExpenseListScope = filter.groupId
      ? { kind: "group", groupId: filter.groupId }
      : filter.withUserId
        ? { kind: "withUser", userId, otherUserId: filter.withUserId }
        : part === ExpenseListPart.ONE_OFF
          ? { kind: "userOneOff", userId }
          : part === ExpenseListPart.GROUP && filter.partGroupId
            ? { kind: "userInGroup", userId, groupId: filter.partGroupId }
            : { kind: "user", userId };
    const pageRows = await listExpensePage(scope, after, size + 1, client);
    const hasMore = pageRows.length > size;
    const rows = hasMore ? pageRows.slice(0, size) : pageRows;
    const lastRow = rows.at(-1);
    const nextCursor = hasMore && lastRow
      ? encodeCursor([lastRow.expense_date, lastRow.created_at_exact, lastRow.id])
      : "";
    const children = await loadExpenseChildren(
      rows.map((expenseRow) => expenseRow.id),
      client,
    );

    // Settledness inputs: the viewer's net per group scope, and per one-off
    // counterparty. Which rows count as settled is decided by the pure
    // settledExpenseIds — this block only gathers the ledger numbers it needs.
    // A deleted expense is never "settled": nothing was pending from it.
    const participants = rows
      .filter((expenseRow) => !expenseRow.deleted_at)
      .map((expenseRow) => ({
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
    const viewerNetByGroupScope = new Map<string, number>();
    for (const [groupId, nets] of await userNetInGroups(userId, groupIds, client)) {
      for (const [currency, cents] of nets) viewerNetByGroupScope.set(groupScopeKey(groupId, currency), cents);
    }
    // One-off slates are per currency, so the settledness lookup is keyed on
    // the counterparty and the expense's currency. One batch for everyone on
    // the page, not a round of reads per person.
    const oneOffNetByPair = new Map<string, number>();
    for (const [counterpartyId, nets] of await oneOffNetsWith(userId, counterpartyIds, client)) {
      for (const [currency, cents] of nets) {
        oneOffNetByPair.set(oneOffPairKey(counterpartyId, currency), cents);
      }
    }
    return { rows, children, hasMore, nextCursor, participants, viewerNetByGroupScope, oneOffNetByPair };
  });

  return {
    expenses: listed.rows.map((expenseRow) => toExpense(expenseRow, listed.children)),
    // Names and avatars, not figures: read once the snapshot's connection is
    // back in the pool.
    users: await usersReferenced(listed.rows, listed.children),
    settledExpenseIds: settledExpenseIds(
      listed.participants,
      userId,
      listed.viewerNetByGroupScope,
      listed.oneOffNetByPair,
    ),
    truncated: legacy && listed.hasMore,
    nextCursor: listed.nextCursor,
  };
}

/**
 * Reads an expense-list cursor back into a position in the list.
 *
 * @param cursor - The client's cursor.
 * @returns The last expense of the previous page.
 * @throws UsecaseError (invalid_argument) when the cursor is not one of this list's.
 */
function decodeExpenseListCursor(cursor: string): ExpenseListKey {
  const parts = decodeCursor(cursor, 3);
  if (!parts) invalid(STALE_CURSOR_MESSAGE);
  const [expenseDate, createdAt, expenseId] = parts;
  if (!isCursorValue(expenseDate) || !isExactTimestamp(createdAt) || !isCursorValue(expenseId)) {
    invalid(STALE_CURSOR_MESSAGE);
  }
  return { expenseDate, createdAt, id: expenseId };
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
 * Fetches one expense with its newest comments and every referenced user.
 *
 * @param userId - Authenticated caller; must be allowed to view the expense.
 * @param expenseId - Id of the expense to fetch.
 * @param commentLimit - How many of the newest comments to include; 0
 *   includes them all, as app versions from before paging expect.
 * @returns The expense (deleted ones included, marked by `deletedAt`), its
 *   newest comments (with authors) and the cursor for older ones, and
 *   referenced users.
 * @throws UsecaseError if the expense is missing or the caller lacks access.
 */
export async function getExpense(userId: string, expenseId: string, commentLimit = 0) {
  const found = await findExpenseById(expenseId);
  // A deleted expense still has a page: the feed line that announced the
  // deletion links here, and the row explains any payment left behind.
  if (!found) notFound("expense not found");
  await assertCanTouch(userId, found);

  // The figures on the page — the expense, its shares, whether it is settled
  // and whether a payment came after it — are read at one instant, so an
  // edit or a payment committing mid-read cannot pair one version's amount
  // with another's shares.
  const { expenseRow, children, settledForViewer, hasLaterSettlement, groupStatus, refusals } = await snapshot(
    async (client) => {
      // Expenses are never hard-deleted, so the row checked above is still there.
      const current = (await findExpenseById(expenseId, client)) ?? found;
      const currentChildren = await loadExpenseChildren([expenseId], client);

      // The same settledness rule the expense list applies, for this one
      // expense, so the detail page and the row that linked to it can never
      // disagree.
      const participantIds = moneyParticipantIds(expenseId, currentChildren);
      const viewerNetByGroupScope = new Map<string, number>();
      if (current.group_id) {
        for (const [currency, cents] of await userNetInGroup(userId, current.group_id, client)) {
          viewerNetByGroupScope.set(groupScopeKey(current.group_id, currency), cents);
        }
      }
      const oneOffNetByPair = new Map<string, number>();
      if (!current.group_id) {
        for (const [participantId, nets] of await oneOffNetsWith(userId, participantIds, client)) {
          for (const [currency, cents] of nets) {
            oneOffNetByPair.set(oneOffPairKey(participantId, currency), cents);
          }
        }
      }
      const settled =
        settledExpenseIds(
          [
            {
              id: expenseId,
              groupId: current.group_id ?? "",
              currency: current.currency,
              participantIds,
            },
          ],
          userId,
          viewerNetByGroupScope,
          oneOffNetByPair,
        ).length === 1;

      // Whether a payment postdates this expense in its scope, so the detail
      // view can warn that an edit or a delete will rebalance against it.
      // Advisory only. In a pairwise group only payments between the
      // expense's own participants count — a settlement between two
      // unrelated members says nothing about this expense — while a
      // simplified group routes debt across everyone, so there any later
      // payment might have been for it.
      const scopeGroup = current.group_id
        ? await findGroupById(current.group_id, client)
        : undefined;
      const laterSettlement = await scopeHasSettlements(
        current.group_id,
        storedParticipantIds(current, currentChildren),
        current.ledger_event_order,
        client,
        scopeGroup ? !scopeGroup.simplify_debts : false,
      );
      // What the edit and delete buttons would run into, so the page can
      // say it in their place instead of sending a request that fails.
      const changeRefusals = scopeGroup && !current.deleted_at
        ? await formerMemberRefusals(scopeGroup, expenseId, currentChildren, userId, client)
        : { editRefusal: "", deleteRefusal: "" };
      return {
        expenseRow: current,
        children: currentChildren,
        settledForViewer: settled,
        hasLaterSettlement: laterSettlement,
        groupStatus: scopeGroup ? GROUP_STATUS_PROTO[scopeGroup.status] : GroupStatus.UNSPECIFIED,
        refusals: changeRefusals,
      };
    },
  );

  // Words, not figures: comments and the edit history are read afterwards.
  const commentPage = commentLimit > 0
    ? await readCommentPage(expenseId, userId, null, commentLimit)
    : { rows: await listCommentsByExpense(expenseId, userId), nextCursor: "" };
  const comments = commentPage.rows;
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

  const session = await liveSessionOf(expenseId);
  const usersById = new Map(
    [
      ...(await usersReferenced([expenseRow], children)),
      ...(await findUsersByIds(session?.peopleIds ?? [])).map(toPublicUser),
    ].map((person) => [person.id, person]),
  );

  return {
    settledForViewer,
    hasLaterSettlement,
    groupStatus,
    editRefusal: refusals.editRefusal,
    deleteRefusal: refusals.deleteRefusal,
    expense: toExpense(expenseRow, children),
    comments: comments.map((comment) => toCommentMessage(comment, publicUserById)),
    commentsNextCursor: commentPage.nextCursor,
    users: [...usersById.values()],
    liveSplit: session
      ? {
          token: session.split.token,
          hostId: session.split.host_id,
          endsAt: session.split.ends_at,
          peopleIds: session.peopleIds,
          savedIds: session.savedIds,
        }
      : undefined,
    history: events.map((event) => ({
      actor: publicUserById(event.actor_id),
      type: event.type,
      createdAt: event.created_at,
    })),
  };
}

/**
 * Lists an expense's older comments, one page at a time, going back in time
 * from GetExpense's `commentsNextCursor`.
 *
 * @param userId - Authenticated caller; must be allowed to view the expense.
 * @param expenseId - Id of the expense whose comments to list.
 * @param page - The previous page's cursor and the page size.
 * @returns The page's comments, oldest first, and the cursor for the ones
 *   older still ("" at the first comment).
 * @throws UsecaseError if the expense is missing, the caller lacks access,
 *   or the cursor is not one of this thread's.
 */
export async function listComments(
  userId: string,
  expenseId: string,
  page: { cursor: string; limit: number },
) {
  const found = await findExpenseById(expenseId);
  if (!found) notFound("expense not found");
  await assertCanTouch(userId, found);
  const before = page.cursor ? decodeCommentCursor(page.cursor) : null;
  const commentPage = await readCommentPage(expenseId, userId, before, page.limit);
  const authors = new Map(
    (await findUsersByIds([...new Set(commentPage.rows.map((comment) => comment.user_id))])).map(
      (author) => [author.id, author] as const,
    ),
  );
  return {
    comments: commentPage.rows.map((comment) =>
      toCommentMessage(comment, (authorId) => {
        const author = authors.get(authorId);
        return author ? toPublicUser(author) : undefined;
      }),
    ),
    nextCursor: commentPage.nextCursor,
  };
}

/**
 * Reads one page of an expense's comments going back in time and puts it in
 * reading order.
 *
 * @param expenseId - Id of the expense.
 * @param viewerId - The reader, for leaving out comments across a block.
 * @param before - The oldest comment already shown; null starts at the newest.
 * @param limit - The requested page size, clamped to the comment limits.
 * @returns The page oldest first, and the cursor for older comments ("" when none).
 */
async function readCommentPage(
  expenseId: string,
  viewerId: string,
  before: CommentKey | null,
  limit: number,
): Promise<{ rows: CommentRow[]; nextCursor: string }> {
  const size = pageSize(limit, COMMENT_PAGE_SIZE, MAX_COMMENT_PAGE_SIZE);
  // One row past the page says whether there are older comments.
  const newestFirst = await listCommentPage(expenseId, viewerId, before, size + 1);
  const hasMore = newestFirst.length > size;
  const page = hasMore ? newestFirst.slice(0, size) : newestFirst;
  const oldest = page.at(-1);
  return {
    rows: [...page].reverse(),
    nextCursor: hasMore && oldest ? encodeCursor([oldest.created_at_exact, oldest.id]) : "",
  };
}

/**
 * Reads a comment cursor back into a position in the thread.
 *
 * @param cursor - The client's cursor.
 * @returns The oldest comment already shown.
 * @throws UsecaseError (invalid_argument) when the cursor is not one of a thread's.
 */
function decodeCommentCursor(cursor: string): CommentKey {
  const parts = decodeCursor(cursor, 2);
  if (!parts) invalid(STALE_CURSOR_MESSAGE);
  const [createdAt, commentId] = parts;
  if (!isExactTimestamp(createdAt) || !isCursorValue(commentId)) invalid(STALE_CURSOR_MESSAGE);
  return { createdAt, id: commentId };
}

/**
 * Maps a comment row to its proto message shape.
 *
 * @param comment - The stored comment.
 * @param authorById - Resolves the author to a public user; undefined when gone.
 * @returns The comment message init shape.
 */
function toCommentMessage(
  comment: CommentRow,
  authorById: (authorId: string) => ReturnType<typeof toPublicUser> | undefined,
) {
  return {
    id: comment.id,
    expenseId: comment.expense_id,
    author: authorById(comment.user_id),
    body: comment.body,
    createdAt: comment.created_at,
  };
}

/**
 * Adds a comment to an expense, records it in the activity feed, and notifies
 * the other participants.
 *
 * A retry of a lost response gets the comment the first attempt stored: no
 * second comment, and nobody is told twice.
 *
 * @param userId - Authenticated caller writing the comment.
 * @param expenseId - Id of the expense being commented on.
 * @param body - Comment text; trimmed, must be non-empty.
 * @param operationId - Names this attempt; "" from an app that does not send one.
 * @returns The stored comment (with author) as a proto message init shape.
 * @throws UsecaseError if the expense is missing, the caller lacks access, or
 *   the comment is empty.
 */
export async function addComment(userId: string, expenseId: string, body: string, operationId = "") {
  const expenseRow = await findExpenseById(expenseId);
  // Deleted expenses stay open to comments: "why was this removed?" is
  // exactly the conversation the kept row is there to host.
  if (!expenseRow) notFound("expense not found");
  await assertCanTouch(userId, expenseRow);
  assertSafeText(body);
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
  const operation = { userId, rpc: "AddComment", operationId };
  const comment = await withLedgerTransaction(async (client) => {
    const claim = await beginOperation(operation, { expenseId, body: trimmed }, client);
    if (claim.replayOf !== null) {
      const earlier = await findCommentById(claim.replayOf, client);
      if (!earlier) notFound("comment not found");
      return earlier;
    }
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
        actorId: userId,
        type: "comment",
        title: `${author.name} commented on "${expenseRow.description}"`,
        body: preview,
        link: `/expenses/${expenseId}`,
      },
      client,
    );
    await finishOperation(operation, stored.id, client);
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
  /** Settle the pair on their net in the currency, offsetting what points the other way. */
  netAcrossScopes?: boolean;
  /** Digest of the position the person was shown; required with `netAcrossScopes`. */
  positionDigest?: string;
  /** The recipient's payment method the money moved through, when one was picked. */
  paymentMethodId?: string;
}

/** What a net settlement did, for the wording that announces it to both people. */
interface NetOutcome {
  /** The net parent the rows hang from; null when nothing pointed the other way. */
  netSettlementId: string | null;
  /** What was cancelled in each direction; 0 when nothing pointed the other way. */
  offsetCents: number;
  /** What the payer still owes the creditor overall once this is recorded. */
  remainingCents: number;
}

/** The rows one recording stored, and what it did overall when it was a net settlement. */
interface StoredSettlement {
  rows: SettlementRow[];
  netOutcome: NetOutcome | null;
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
}

/**
 * Resolves how a payment was made into what the settlement row stores.
 *
 * A payment can name one of the recipient's own payment methods. When it
 * does, the row takes that method's key and keeps a copy of its name, so
 * the record still says "bKash" after the method is renamed or removed.
 *
 * The method must belong to whoever received the money. An id that does not
 * resolve (removed since the dialog opened, or never theirs) is not an
 * error: the payment happened either way, so it is recorded from the plain
 * method key with no name rather than refused.
 *
 * Call it only once the write has established that the payer owes the
 * recipient, never before. Reading the method is reading something that is
 * shown only to a person who owes, and the name read here is copied into a
 * record both people can see: looked up ahead of the debt check, it would
 * be one changed line away from telling anyone who can name an id what a
 * stranger calls their bank account.
 *
 * @param request - The settlement request.
 * @param creditorId - Who received the money.
 * @param client - The settlement's transaction, so the read belongs to it.
 * @returns The settlement method key and the name to keep with it.
 */
async function resolveSettlementMethod(
  request: SettlementRequest,
  creditorId: string,
  client: PoolClient,
): Promise<{ method: string; methodLabel: string }> {
  const stored = request.paymentMethodId
    ? await findPaymentMethod(request.paymentMethodId, creditorId, client)
    : undefined;
  // The name is copied into the payment record, which both people read.
  const paymentMethod = stored ? cleanMethodRow(stored) : undefined;
  if (!paymentMethod) {
    return {
      method: SETTLEMENT_METHODS.has(request.method) ? request.method : "cash",
      methodLabel: "",
    };
  }
  return {
    method: settlementMethodKey("", {
      preset: paymentMethod.preset ?? "",
      details: paymentMethod.details,
    }),
    methodLabel: paymentMethod.name,
  };
}

/**
 * Validates a settlement request and resolves its normalized identities,
 * currency and scope. The payment method it names is resolved later, by the
 * write, once the debt has been checked.
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
  if (request.note.length > MAX_SETTLEMENT_NOTE_LENGTH) {
    invalid(`settlement note is too long (max ${MAX_SETTLEMENT_NOTE_LENGTH} characters)`);
  }
  // Netting is about the pair, across everything they share. One group's
  // balance, or a hand-picked subset, is a different question with its own
  // answer; mixing the two would let a client choose what gets cancelled.
  if (request.netAcrossScopes && (request.groupId || (request.scopeGroupIds ?? []).length > 0)) {
    invalid("a net settlement covers every balance with this person — it cannot name a group");
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
    // A group settles in its own currency. Another is accepted only to pay
    // down a balance the group already holds in it, which the write checks
    // under the group's lock; relabelling the amount would invent an
    // exchange rate.
    currency = request.currency ? normalizeCurrencyCode(request.currency) : group.currency;
  }
  if (!currency) currency = (await findUserById(userId))?.default_currency ?? "USD";
  currency = normalizeCurrencyCode(currency);
  if (request.amountCents > MAX_MONEY_CENTS) refuseTooLarge(currency);
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
  const { userId, request, payerId, creditorId, groupId, currency } = context;
  if (!groupId) throw new Error("storeGroupSettlement requires a group id");
  await lockGroupLedgers(client, [groupId]);
  await assertGroupActive(groupId, client);
  const callerIsMember = await isMember(groupId, userId, client);
  const recipientIsMember = await isMember(groupId, request.toUserId, client);
  if (!callerIsMember || !recipientIsMember) {
    denied("both people must be members of the group");
  }
  // A pairwise loop that nets to zero is not debt. Paying one edge would
  // instead leave the payer owed elsewhere around the loop.
  if (await groupCancelsOut(groupId, currency, client)) {
    invalid(
      "these debts cancel out around a loop — everyone here is settled up overall; turn on Simplify debts to clear the view",
    );
  }
  const outstandingCents = await amountOwed(payerId, creditorId, groupId, currency, client);
  if (outstandingCents <= 0) {
    // A payment in another currency can only pay down a balance the group
    // already holds in it (one recorded before group payments were kept to
    // the group's currency); with none, the currency is the mistake.
    const groupCurrency = (await findGroupById(groupId, client))?.currency ?? currency;
    if (currency !== groupCurrency) invalid(`this group settles in ${groupCurrency}, not ${currency}`);
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
  const { method, methodLabel } = await resolveSettlementMethod(request, creditorId, client);
  return [
    await insertSettlement(
      {
        groupId,
        fromUser: payerId,
        toUser: creditorId,
        amountCents: request.amountCents,
        currency,
        method,
        methodLabel,
        note: request.note,
        recordedBy: userId,
      },
      client,
    ),
  ];
}

/**
 * Raised inside a settlement's transaction when a group became shared
 * between the two people after their shared groups were locked. The
 * transaction rolls back and the settlement starts again with that group
 * locked too.
 */
class SharedGroupsChanged extends Error {
  /** Names the error for logs. */
  constructor() {
    super("the groups two people share changed while their payment was being recorded");
  }
}

/**
 * Refuses a payment between two people when the payer owes nothing.
 *
 * @param context - The prepared settlement.
 * @throws UsecaseError (invalid_argument), always, worded for the kind of payment.
 */
function refuseNothingOwed(context: SettlementContext): never {
  const { request, currency } = context;
  if (request.netAcrossScopes) {
    invalid(
      request.received
        ? `this person doesn't owe you anything overall in ${currency}`
        : `you don't owe this person anything overall in ${currency}`,
    );
  }
  invalid(
    request.received
      ? `this person doesn't owe you anything in the selected ${currency} balances`
      : `you don't owe this person anything in the selected ${currency} balances`,
  );
}

/**
 * Refuses, before any lock is taken, a payment to somebody the payer owes
 * nothing anywhere: not in a group they share, not one to one. Read on a
 * snapshot, like every figure. It only ever refuses; whatever it lets
 * through is checked again under the locks. A retry of an operation already
 * recorded is let through, for the transaction to replay: by then the debt
 * it paid is gone, and refusing would lose the answer the first attempt gave.
 *
 * @param context - A prepared settlement that names no group.
 * @param operation - The request's operation, to recognise a retry.
 * @throws UsecaseError (invalid_argument) when nothing is owed.
 */
async function refuseUnlessAnythingOwed(context: SettlementContext, operation: OperationKey): Promise<void> {
  const owed = await snapshot(async (client) =>
    (await operationClaimed(operation, client)) ? null : owedByScope(context.payerId, context.creditorId, client),
  );
  if (owed !== null && owed.length === 0) refuseNothingOwed(context);
}

/**
 * Validates a prepared payment against current locked ledgers and stores one
 * settlement row per scope it pays down.
 *
 * @param context - Validated settlement identities and normalized values.
 * @param client - Pair-lock transaction client.
 * @returns Stored rows, with the direct slate first for cross-scope payments,
 *   and the overall outcome when the payment was a net settlement.
 */
async function storeSettlementPortions(
  context: SettlementContext,
  client: PoolClient,
): Promise<StoredSettlement> {
  const { userId, request, payerId, creditorId, groupId, currency } = context;
  if (groupId) return { rows: await storeGroupSettlement(context, client), netOutcome: null };

  // Lock the groups the two share, the only groups a payment between them
  // can touch, before reading what is owed in them: never every group either
  // belongs to, which one person can make thousands of. A group joins the
  // shared set only through a roster or status change, which takes its lock,
  // so the set is read again under the locks, and one that grew in between
  // is retried from the start rather than settled around.
  const lockedGroupIds = new Set(
    (await sharedActiveGroups(payerId, creditorId, client)).map((group) => group.id),
  );
  await lockGroupLedgers(client, [...lockedGroupIds]);
  const sharedUnderLock = await sharedActiveGroups(payerId, creditorId, client);
  if (sharedUnderLock.some((group) => !lockedGroupIds.has(group.id))) throw new SharedGroupsChanged();
  // From here every balance is read from exactly these groups, all locked,
  // and each group's history is read once, however many directions or
  // scopes the payment looks at: everyone else's writes to them wait while
  // it does.
  if (request.netAcrossScopes) return storeNetSettlement(context, sharedUnderLock, client);
  const selection = new Set(request.scopeGroupIds ?? []);
  // The client chooses scopes, never amounts. Re-read current server balances
  // so a stale selection cannot double-record a payment.
  const selected = (await owedByScope(payerId, creditorId, client, sharedUnderLock)).filter(
    (scope) => selection.size === 0 || selection.has(scope.groupId ?? ""),
  );
  // There is no exchange rate in the request, so an explicitly selected
  // balance with nothing in the payment's currency must be rejected rather
  // than relabelled. A group can hold balances in two currencies (one
  // recorded before group payments were kept to its own); picking it pays
  // down the one in the payment's currency.
  const foreign = selected.find(
    (scope) =>
      scope.currency !== currency &&
      selection.has(scope.groupId ?? "") &&
      !selected.some((other) => other.groupId === scope.groupId && other.currency === currency),
  );
  if (foreign) {
    invalid(
      `that balance is in ${foreign.currency} — settle it in ${foreign.currency}, not ${currency}`,
    );
  }
  const scopes = selected.filter((scope) => scope.currency === currency);
  const totalOwedCents = scopes.reduce((running, scope) => running + scope.owedCents, 0);
  if (totalOwedCents <= 0) refuseNothingOwed(context);
  if (request.amountCents > totalOwedCents) {
    invalid(
      `settlement (${formatMoney(request.amountCents, currency)}) exceeds what ${
        request.received ? "they owe" : "you owe"
      } there (${formatMoney(totalOwedCents, currency)})`,
    );
  }

  const { method, methodLabel } = await resolveSettlementMethod(request, creditorId, client);
  const rows: SettlementRow[] = [];
  const portions = allocateSettlement(scopes, request.amountCents);
  await assertGroupsActive(portions.flatMap((portion) => portion.groupId ? [portion.groupId] : []), client);
  for (const portion of portions) {
    rows.push(
      await insertSettlement(
        {
          groupId: portion.groupId,
          fromUser: payerId,
          toUser: creditorId,
          amountCents: portion.amountCents,
          currency: portion.currency,
          method,
          methodLabel,
          note: request.note,
          recordedBy: userId,
        },
        client,
      ),
    );
  }
  return { rows, netOutcome: null };
}

/**
 * Stores a payment that settles the pair on their net in one currency: the
 * cash, plus the entries that cancel balances pointing the other way against
 * what the payer owes (see {@link planNetSettlement}).
 *
 * Three guarantees, in order:
 * 1. It settles what the person saw. Both directions are re-read here, under
 *    the locks, by the same function that built the position the dialog
 *    showed, from one read of the pair's ledgers, and the two fingerprints
 *    must match. A ledger that moved in between is refused rather than
 *    settled differently than agreed.
 * 2. It is checked against the net — the one place a settlement is — because
 *    the opposing scopes are cancelled in this same transaction, so here they
 *    do absorb the difference.
 * 3. Its rows are one unit. They hang from a parent row stating what they
 *    must add up to, and the database refuses to commit a set that does not
 *    cancel out, or to leave one partly removed later.
 *
 * @param context - Prepared settlement with no group id.
 * @param sharedGroups - The groups the pair shares, read under their locks:
 *   the only groups it reads or touches.
 * @param client - Pair-lock transaction client.
 * @returns Stored rows, the cash first, and what the settlement did overall.
 */
async function storeNetSettlement(
  context: SettlementContext,
  sharedGroups: readonly GroupRow[],
  client: PoolClient,
): Promise<StoredSettlement> {
  const { userId, request, payerId, creditorId, currency } = context;
  const debts = (await pairScopeDebts(payerId, creditorId, client, sharedGroups)).filter(
    (debt) => debt.currency === currency,
  );
  if (!request.positionDigest) invalid("a net settlement must name the balances it settles");
  if (positionDigest(currency, debts) !== request.positionDigest) {
    invalid("these balances changed since you opened this — check the amounts and try again");
  }
  const owing = debts.filter((debt) => debt.debtorId === payerId);
  const opposing = debts.filter((debt) => debt.debtorId === creditorId);
  const total = (scopes: { owedCents: number }[]) =>
    scopes.reduce((running, scope) => running + scope.owedCents, 0);
  const offsetCents = total(opposing);
  const netCents = total(owing) - offsetCents;
  if (netCents <= 0) refuseNothingOwed(context);
  if (request.amountCents > netCents) {
    invalid(
      `settlement (${formatMoney(request.amountCents, currency)}) exceeds what ${
        request.received ? "they owe" : "you owe"
      } overall (${formatMoney(netCents, currency)})`,
    );
  }

  const { method, methodLabel } = await resolveSettlementMethod(request, creditorId, client);
  const plan = planNetSettlement(owing, opposing, request.amountCents);
  const portions = [...plan.cash, ...plan.offsetOwing, ...plan.offsetOpposing];
  if (offsetCents > MAX_MONEY_CENTS || portions.some((portion) => portion.amountCents > MAX_MONEY_CENTS)) {
    invalid(NET_SETTLEMENT_TOO_LARGE_MESSAGE);
  }
  await assertGroupsActive(portions.flatMap((portion) => portion.groupId ? [portion.groupId] : []), client);
  // Nothing pointing the other way means nothing to cancel: the rows are an
  // ordinary payment and need no parent.
  const netSettlementId =
    offsetCents > 0
      ? await insertNetSettlement(
          { currency, cashCents: request.amountCents, offsetCents },
          client,
        )
      : null;
  const rows: SettlementRow[] = [];
  /**
   * Inserts one planned slice as a settlement row of this unit.
   *
   * @param portion - The scope and amount.
   * @param fromUser - Whose debt the row settles.
   * @param toUser - Who that debt was owed to.
   * @param rowMethod - The payment method, or the offset marker.
   * @param rowMethodLabel - The method's name; "" for an offset, which moved no money.
   * @param note - The row's note.
   */
  const store = async (
    portion: { groupId: string | null; currency: string; amountCents: number },
    fromUser: string,
    toUser: string,
    rowMethod: string,
    rowMethodLabel: string,
    note: string,
  ) => {
    rows.push(
      await insertSettlement(
        {
          groupId: portion.groupId,
          fromUser,
          toUser,
          amountCents: portion.amountCents,
          currency: portion.currency,
          method: rowMethod,
          methodLabel: rowMethodLabel,
          note,
          recordedBy: userId,
          netSettlementId,
        },
        client,
      ),
    );
  };
  for (const portion of plan.cash) {
    await store(portion, payerId, creditorId, method, methodLabel, request.note);
  }
  for (const portion of plan.offsetOwing) {
    await store(portion, payerId, creditorId, OFFSET_SETTLEMENT_METHOD, "", "");
  }
  for (const portion of plan.offsetOpposing) {
    await store(portion, creditorId, payerId, OFFSET_SETTLEMENT_METHOD, "", "");
  }
  return {
    rows,
    netOutcome: { netSettlementId, offsetCents, remainingCents: netCents - request.amountCents },
  };
}

/**
 * Where a settlement row lives, as a phrase for a sentence about it.
 *
 * @param group - The row's group, or undefined for the one-off slate.
 * @returns ` in "Name"`, or " outside groups".
 */
function scopePhrase(group: { name: string } | undefined): string {
  return group ? ` in "${group.name}"` : " outside groups";
}

/**
 * Writes activity and the counterparty notification for a stored payment on
 * the payment transaction.
 *
 * A net settlement is announced so that neither person has to work out what
 * happened: the payment line says it settled the pair up (or how much is
 * left), every cancelled balance gets its own line in the scope it lived in,
 * naming who owed whom, and the notification gives the other person the
 * amounts cancelled and what remains. A cancelled balance is never worded or
 * typed as a payment; nobody was paid that amount.
 *
 * @param context - Validated settlement identities and normalized values.
 * @param stored - The rows just inserted and, for a net settlement, its outcome.
 * @param client - Pair-lock transaction client.
 */
async function announceSettlement(
  context: SettlementContext,
  stored: StoredSettlement,
  client: PoolClient,
): Promise<void> {
  const { userId, request, recipient, actor, payerId, creditorId, groupId, currency } = context;
  const payerName = request.received ? recipient.name : actor.name;
  const creditorName = request.received ? actor.name : recipient.name;
  const nameOf = (personId: string) => (personId === payerId ? payerName : creditorName);
  const friendLink = `/friends/${request.toUserId}`;
  const outcome = stored.netOutcome;
  const netted = outcome !== null && outcome.offsetCents > 0;
  const groupIds = [...new Set(stored.rows.flatMap((entry) => entry.group_id ? [entry.group_id] : []))];
  const groups = groupIds.length > 0 ? await findGroupsByIds(groupIds, client) : [];
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  // Each portion belongs in its own scope's feed, but remains visible only to
  // the payer and recipient rather than every member of a group.
  for (const settlement of stored.rows) {
    const group = settlement.group_id ? groupsById.get(settlement.group_id) : undefined;
    const amount = formatMoney(settlement.amount_cents, currency);
    const link = settlement.group_id ? `/groups/${settlement.group_id}` : friendLink;
    if (settlement.method === OFFSET_SETTLEMENT_METHOD) {
      const debtorName = nameOf(settlement.from_user);
      const owedName = nameOf(settlement.to_user);
      await insertActivity(
        {
          groupId: settlement.group_id,
          actorId: userId,
          type: OFFSET_ACTIVITY_TYPE,
          message: `${amount} ${debtorName} owed ${owedName}${scopePhrase(group)} was cancelled against what ${owedName} owed ${debtorName} — no money moved for this part`,
          link,
          audience: [...new Set([payerId, creditorId])],
          amountCents: settlement.amount_cents,
          currency,
        },
        client,
      );
      continue;
    }
    const settledNote = !netted
      ? ""
      : outcome.remainingCents === 0
        ? ` — settles everything between them in ${currency}`
        : ` — ${formatMoney(outcome.remainingCents, currency)} still owed overall in ${currency}`;
    await insertActivity(
      {
        groupId: settlement.group_id,
        // The feed subject is the person who paid. recorded_by still preserves
        // who asserted the payment when the recipient entered it.
        actorId: payerId,
        type: "settlement",
        message: `${payerName} paid ${creditorName} ${amount}${group ? ` in "${group.name}"` : ""}${settledNote}${request.received ? ` — recorded by ${actor.name}` : ""}`,
        link,
        audience: [...new Set([payerId, creditorId])],
        amountCents: settlement.amount_cents,
        currency,
        creditUserId: creditorId,
      },
      client,
    );
  }
  const notifyGroup = groupId ? groupsById.get(groupId) : undefined;
  const cancelled = netted ? formatMoney(outcome.offsetCents, currency) : "";
  const nettedBody = !netted
    ? ""
    : outcome.remainingCents === 0
      ? `You two are settled up in ${currency}. ${cancelled} you each owed the other was cancelled, so only the difference was paid.`
      : `${cancelled} you each owed the other in ${currency} was cancelled. ${payerName} still owes ${creditorName} ${formatMoney(outcome.remainingCents, currency)}.`;
  await insertNotifications(
    [request.toUserId],
    {
      actorId: userId,
      type: "settlement",
      title: request.received
        ? `${actor.name} recorded your payment of ${formatMoney(request.amountCents, currency)}`
        : `${actor.name} recorded a payment of ${formatMoney(request.amountCents, currency)} to you`,
      body: nettedBody || (notifyGroup ? notifyGroup.name : "Settlement"),
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
 * With `netAcrossScopes` the payment settles the pair on their net in the
 * currency: balances pointing the other way are cancelled against what the
 * payer owes, in the same transaction, so the amount is checked against the
 * net and a full payment leaves every scope the pair shares at zero.
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
  const operation = { userId, rpc: "RecordSettlement", operationId: request.operationId ?? "" };
  // First: a saved payment is answered as saved, whatever has changed since.
  // Refusing its retry (the other person has left the group, say) would read as
  // "not recorded", and whoever sees that pays again.
  const savedId = await snapshot((client) => finishedOperationResult(operation, request, client));
  if (savedId !== null) {
    const saved = await findSettlementById(savedId);
    if (!saved) notFound("payment not found");
    return toSettlement(saved);
  }
  const context = await prepareSettlement(userId, request);
  if (!context.groupId) await refuseUnlessAnythingOwed(context, operation);

  // Validation + inserts inside the pair lock, so a concurrent recording of
  // the same real-world payment — from another tab, another device, or the
  // other scope's page — waits here, then re-reads a ledger that already
  // contains this one, and is refused by the guards instead of doubling up.
  // The inserts ride the lock's transaction: portions land atomically, and
  // become visible at the same instant the lock releases — and so do the
  // feed rows and the notification, which commit with the payment or not at
  // all.
  /** One attempt, in one transaction under the pair's lock. */
  const attempt = () => withLedgerTransaction(async (client) => {
    // Claimed before any lock, as every money write claims: a retry of a
    // lost response finds the claim the first attempt committed and answers
    // with its recording at once — never a second one, which the over-settle
    // guard alone could not catch for a partial payment.
    const claim = await beginOperation(operation, request, client);
    if (claim.replayOf !== null) {
      const replayed = await findSettlementById(claim.replayOf, client);
      return replayed ? [replayed] : [];
    }
    await lockSettlementPair(client, context.payerId, context.creditorId);
    const stored = await storeSettlementPortions(context, client);
    await announceSettlement(context, stored, client);
    await finishOperation(operation, stored.rows[0].id, client);
    return stored.rows;
  });
  let settlements: SettlementRow[] | undefined;
  for (let attemptNumber = 1; settlements === undefined; attemptNumber++) {
    try {
      settlements = await attempt();
    } catch (error) {
      if (!(error instanceof SharedGroupsChanged)) throw error;
      if (attemptNumber >= SETTLEMENT_ATTEMPTS) {
        invalid("your groups with this person changed while you were paying — check the amounts and try again");
      }
    }
  }
  if (settlements.length === 0) notFound("payment not found");
  return toSettlement(settlements[0]);
}

/**
 * Removes a mistaken payment. Either of the two people on it may — both are
 * affected, and the other one is told. A soft delete: the row keeps its
 * place in the friend ledger, struck through, while every balance ignores it
 * from here on, so the debt it had paid down comes back exactly.
 *
 * A net settlement is removed whole or not at all. Its rows only mean
 * something together: taking out one cancelled balance while its counterpart
 * stands would leave a debt cancelled against nothing. So removing any one
 * of its rows removes all of them, in this one transaction, and every
 * balance it had settled comes back exactly as it was. The database enforces
 * the same rule independently, so no other code path can do it by halves.
 *
 * Runs under the pair lock plus every affected group lock, like recording: a
 * settlement being validated against this payment must see it either counted
 * or gone, never half-way.
 *
 * @param userId - Authenticated caller; must be the payer or the recipient.
 * @param settlementId - Id of the settlement to remove, or of any row of the
 *   net settlement to remove.
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
  const other = await findUserById(otherUserId);
  const nameOf = (personId: string) =>
    (personId === userId ? actor.name : other?.name) ?? "someone";
  await withSettlementPairLock(existing.from_user, existing.to_user, async (client) => {
    // Every scope the unit touches is locked before anything is removed. The
    // rows of a net settlement never change scope, so reading them first to
    // learn which groups to lock is safe.
    const unit = existing.net_settlement_id
      ? await listSettlementsByNetSettlement(existing.net_settlement_id, client)
      : [existing];
    const groupIds = [...new Set(unit.flatMap((portion) => (portion.group_id ? [portion.group_id] : [])))];
    await lockGroupLedgers(client, groupIds);
    const current = await findSettlementById(settlementId, client);
    if (!current || current.deleted_at) notFound("payment not found");
    // Removing a net settlement reopens every scope in its unit, even when
    // the selected row itself lives outside an archived group.
    const groupsById = await assertGroupsActive(groupIds, client);
    // Nor may it reopen a group balance of somebody who has since left it:
    // nothing could settle that again.
    const lockedUnit = current.net_settlement_id
      ? await listSettlementsByNetSettlement(current.net_settlement_id, client)
      : [current];
    for (const groupId of groupIds) {
      const changeByUser = new Map<string, number>();
      for (const portion of lockedUnit.filter((unitRow) => unitRow.group_id === groupId)) {
        changeByUser.set(portion.from_user, (changeByUser.get(portion.from_user) ?? 0) - portion.amount_cents);
        changeByUser.set(portion.to_user, (changeByUser.get(portion.to_user) ?? 0) + portion.amount_cents);
      }
      await assertFormerMembersUnmoved(groupId, changeByUser, userId, client);
    }
    let removed: SettlementRow[];
    if (current.net_settlement_id) {
      removed = await softDeleteNetSettlement(current.net_settlement_id, userId, client);
    } else {
      await softDeleteSettlement(settlementId, userId, client);
      removed = [current];
    }
    const cashRows = removed.filter((portion) => portion.method !== OFFSET_SETTLEMENT_METHOD);
    const offsetRows = removed.filter((portion) => portion.method === OFFSET_SETTLEMENT_METHOD);
    const cashCents = cashRows.reduce((running, portion) => running + portion.amount_cents, 0);
    // Each direction of a net settlement cancels the same amount; one side is it.
    const cancelledCents = offsetRows
      .filter((portion) => portion.from_user === offsetRows[0].from_user)
      .reduce((running, portion) => running + portion.amount_cents, 0);
    const cashAmount = formatMoney(cashCents, current.currency);
    // Announced on the same transaction as the removal: the feed rows are
    // the only record of who removed it and when, so they cannot be allowed
    // to go missing while the removal stands. One line per scope touched, so
    // each group's feed says what came back there.
    for (const portion of removed) {
      const group = portion.group_id ? groupsById.get(portion.group_id) : undefined;
      const amount = formatMoney(portion.amount_cents, portion.currency);
      const wasOffset = portion.method === OFFSET_SETTLEMENT_METHOD;
      await insertActivity(
        {
          groupId: portion.group_id,
          actorId: userId,
          type: "settlement_deleted",
          message: wasOffset
            ? `${actor.name} removed a payment that had cancelled ${amount} ${nameOf(portion.from_user)} owed ${nameOf(portion.to_user)}${scopePhrase(group)} — that is owed again`
            : `${actor.name} removed the payment "${nameOf(portion.from_user)} paid ${nameOf(portion.to_user)} ${amount}"${group ? ` in "${group.name}"` : ""}${offsetRows.length > 0 ? " and everything it had cancelled" : ""}`,
          link: portion.group_id ? `/groups/${portion.group_id}` : `/friends/${otherUserId}`,
          audience: [...new Set([portion.from_user, portion.to_user])],
          amountCents: portion.amount_cents,
          currency: portion.currency,
        },
        client,
      );
    }
    const notifyGroup =
      !current.net_settlement_id && current.group_id
        ? await findGroupById(current.group_id, client)
        : undefined;
    await insertNotifications(
      [otherUserId],
      {
        actorId: userId,
        type: "settlement_deleted",
        title: `${actor.name} removed the payment of ${cashAmount}`,
        body:
          offsetRows.length > 0
            ? `The ${formatMoney(cancelledCents, current.currency)} it had cancelled each way is owed again, exactly as before the payment.`
            : notifyGroup
              ? notifyGroup.name
              : "Settlement",
        link:
          !current.net_settlement_id && current.group_id
            ? `/groups/${current.group_id}`
            : `/friends/${userId}`,
      },
      client,
    );
  });
}
