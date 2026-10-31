/** All SQL for expenses and their child tables (payers, splits, items, assignments). */

import { execute, newId, query, queryOne, transaction } from "@/server/common/db/db";
import { exactTimeSql } from "@/server/common/pagination/pagination";
import { expenseInvolvesSql } from "./expenseInvolvement";
import { LEDGER_LINE_RANK } from "@/server/expense/expense.constants";
import type { LedgerLineKey } from "@/server/expense/domain/ledgerOrder";
import type { PoolClient } from "pg";

/** One row of the expenses table (column names mirror SQL). */
export interface ExpenseRow {
  id: string;
  /** Owning group id; NULL ⇒ a one-off (non-group) expense. */
  group_id: string | null;
  description: string;
  amount_cents: number;
  currency: string;
  category: string;
  /** Calendar date of the expense (YYYY-MM-DD). */
  expense_date: string;
  /** How the expense is divided: equal | exact | percent | shares | itemized. */
  split_type: string;
  notes: string;
  /** Tax in cents; only meaningful for itemized expenses. */
  tax_cents: number;
  /** Tip in cents; only meaningful for itemized expenses. */
  tip_cents: number;
  created_by: string;
  created_at: string;
  /** Monotonic order shared with settlements for mutation-safety checks. */
  ledger_event_order: number;
  /** Soft-delete timestamp; NULL ⇒ the expense is active. */
  deleted_at: string | null;
  /** Goes up with every saved change. */
  version: number;
  /** Who saved the latest change; NULL until the first edit. */
  updated_by: string | null;
  /** The authenticated user who deleted it; NULL while it is active. */
  deleted_by: string | null;
}

/** One row of expense_payers: how much a user paid toward an expense. */
export interface PayerRow {
  expense_id: string;
  user_id: string;
  amount_cents: number;
}

/** One row of expense_splits: how much a user owes for an expense. */
export interface SplitRow {
  expense_id: string;
  user_id: string;
  owed_cents: number;
}

/** One row of expense_items: a line item on an itemized expense. */
export interface ItemRow {
  id: string;
  expense_id: string;
  name: string;
  quantity: number;
  total_cents: number;
}

/** One row of expense_item_assignments: a user's relative portion of an item. */
export interface ItemAssignmentRow {
  item_id: string;
  user_id: string;
  /** Relative portion of the item this user consumed (weights are ratios). */
  weight: number;
}

/** A fully validated expense (with authoritative splits) ready to be written. */
export interface ExpenseWrite {
  groupId: string | null;
  description: string;
  amountCents: number;
  currency: string;
  category: string;
  expenseDate: string;
  splitType: string;
  notes: string;
  taxCents: number;
  tipCents: number;
  createdBy: string;
  payers: { userId: string; amountCents: number }[];
  splits: { userId: string; owedCents: number }[];
  items: {
    /** The saved line this is, so it keeps its identity across edits; absent on a new line. */
    id?: string;
    name: string;
    quantity: number;
    totalCents: number;
    assignments: { userId: string; weight: number }[];
  }[];
}

/**
 * Builds a multi-row `VALUES` clause and its params for a set of rows, e.g.
 * `VALUES ($1, $2), ($3, $4), ...` for `[{a:1,b:2},{a:3,b:4}]`.
 *
 * @param rows - Row objects to flatten into placeholders.
 * @param columns - Keys to read from each row, in order.
 * @returns `{ clause, params }` ready to splice into an INSERT, or null when
 *   `rows` is empty (caller skips the statement).
 */
function multiRowValues<RowType extends Record<string, unknown>>(
  rows: RowType[],
  columns: (keyof RowType)[],
): { clause: string; params: unknown[] } | null {
  if (rows.length === 0) return null;
  const placeholders: string[] = [];
  const params: unknown[] = [];
  let placeholderIndex = 1;
  for (const currentRow of rows) {
    const rowPlaceholders = columns.map((column) => {
      params.push(currentRow[column]);
      return `$${placeholderIndex++}`;
    });
    placeholders.push(`(${rowPlaceholders.join(", ")})`);
  }
  return { clause: placeholders.join(", "), params };
}

/**
 * Inserts the payer, split and item (+assignment) child rows for an expense
 * using multi-row VALUES inserts (one statement per table, not one per row).
 * Must run inside the caller's transaction so partial writes cannot persist.
 *
 * @param client - Transaction-scoped client; every statement must use it.
 * @param expenseId - Id of the parent expense the child rows reference.
 * @param input - Validated expense whose child collections are written.
 */
async function insertChildren(
  client: PoolClient,
  expenseId: string,
  input: ExpenseWrite,
): Promise<void> {
  // expense_id is part of every row, not a leading parameter: multiRowValues
  // numbers placeholders per column, so prepending it to params would shift
  // every value by one and leave the statement a column short.
  const payersValues = multiRowValues(
    input.payers.map((payer) => ({ expenseId, ...payer })),
    ["expenseId", "userId", "amountCents"] as const,
  );
  if (payersValues) {
    await client.query(
      `INSERT INTO expense_payers (expense_id, user_id, amount_cents) VALUES ${payersValues.clause}`,
      payersValues.params,
    );
  }

  const splitsValues = multiRowValues(
    input.splits.map((split) => ({ expenseId, ...split })),
    ["expenseId", "userId", "owedCents"] as const,
  );
  if (splitsValues) {
    await client.query(
      `INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES ${splitsValues.clause}`,
      splitsValues.params,
    );
  }

  // Items + assignments: items are multi-row, then assignments reference the
  // item ids. A saved line keeps its id, which is how two people editing at
  // once can tell they are talking about the same line.
  const itemRows = input.items.map((item, position) => ({
    id: item.id || newId(),
    expenseId,
    name: item.name,
    quantity: item.quantity,
    totalCents: item.totalCents,
    position,
  }));
  if (itemRows.length > 0) {
    const itemsValues = multiRowValues(itemRows, ["id", "expenseId", "name", "quantity", "totalCents", "position"] as const);
    await client.query(
      `INSERT INTO expense_items (id, expense_id, name, quantity, total_cents, position) VALUES ${itemsValues!.clause}`,
      itemsValues!.params,
    );

    const assignmentRows = input.items.flatMap((item, itemIndex) =>
      item.assignments.map((assignment) => ({
        itemId: itemRows[itemIndex].id,
        userId: assignment.userId,
        weight: assignment.weight,
      })),
    );
    const assignmentsValues = multiRowValues(assignmentRows, ["itemId", "userId", "weight"] as const);
    if (assignmentsValues) {
      await client.query(
        `INSERT INTO expense_item_assignments (item_id, user_id, weight) VALUES ${assignmentsValues.clause}`,
        assignmentsValues.params,
      );
    }
  }
}

/**
 * Inserts an expense and all its child rows in a single transaction.
 *
 * @param input - Validated expense to persist.
 * @param client - Optional transaction client holding the expense scope lock.
 * @returns The generated id of the new expense.
 */
export async function insertExpense(input: ExpenseWrite, client?: PoolClient): Promise<string> {
  const expenseId = newId();
  const persist = async (transactionClient: PoolClient) => {
    await transactionClient.query(
      `INSERT INTO expenses
         (id, group_id, description, amount_cents, currency, category,
          expense_date, split_type, notes, tax_cents, tip_cents, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        expenseId,
        input.groupId,
        input.description,
        input.amountCents,
        input.currency,
        input.category,
        input.expenseDate,
        input.splitType,
        input.notes,
        input.taxCents,
        input.tipCents,
        input.createdBy,
      ],
    );
    await insertChildren(transactionClient, expenseId, input);
  };
  if (client) await persist(client);
  else await transaction(persist);
  return expenseId;
}

/**
 * Overwrites an expense in place: updates the main row and replaces every
 * child row (payers, splits, items, assignments) in a single transaction.
 *
 * @param expenseId - Id of the expense to overwrite.
 * @param input - Validated replacement expense.
 * @param updatedBy - Who is saving this change.
 * @param client - Optional transaction client holding the expense scope lock.
 */
export async function replaceExpense(
  expenseId: string,
  input: ExpenseWrite,
  updatedBy: string,
  client?: PoolClient,
): Promise<void> {
  const persist = async (transactionClient: PoolClient) => {
    await transactionClient.query(
      `UPDATE expenses SET
         group_id = $1, description = $2, amount_cents = $3, currency = $4,
         category = $5, expense_date = $6, split_type = $7, notes = $8,
         tax_cents = $9, tip_cents = $10, updated_by = $12, version = version + 1
       WHERE id = $11`,
      [
        input.groupId,
        input.description,
        input.amountCents,
        input.currency,
        input.category,
        input.expenseDate,
        input.splitType,
        input.notes,
        input.taxCents,
        input.tipCents,
        expenseId,
        updatedBy,
      ],
    );
    await transactionClient.query(
      `DELETE FROM expense_item_assignments WHERE item_id IN
         (SELECT id FROM expense_items WHERE expense_id = $1)`,
      [expenseId],
    );
    await transactionClient.query(`DELETE FROM expense_items WHERE expense_id = $1`, [expenseId]);
    await transactionClient.query(`DELETE FROM expense_payers WHERE expense_id = $1`, [expenseId]);
    await transactionClient.query(`DELETE FROM expense_splits WHERE expense_id = $1`, [expenseId]);
    await insertChildren(transactionClient, expenseId, input);
  };
  if (client) await persist(client);
  else await transaction(persist);
}

/**
 * Marks an expense deleted (sets deleted_at and who deleted it) without
 * removing any rows.
 *
 * @param expenseId - Id of the expense to soft-delete.
 * @param deletedBy - The authenticated user deleting it.
 * @param client - Optional transaction client holding the expense scope lock.
 */
export async function softDeleteExpense(
  expenseId: string,
  deletedBy: string,
  client?: PoolClient,
): Promise<void> {
  await execute(
    `UPDATE expenses SET deleted_at = now(), deleted_by = $2 WHERE id = $1`,
    [expenseId, deletedBy],
    client,
  );
}

/**
 * Fetches a single expense row, including soft-deleted ones.
 *
 * @param expenseId - Id of the expense to fetch.
 * @param client - Optional transaction client for a lock-protected read.
 * @returns The matching row, or undefined if the id is unknown.
 */
export async function findExpenseById(
  expenseId: string,
  client?: PoolClient,
): Promise<ExpenseRow | undefined> {
  return queryOne<ExpenseRow>(`SELECT * FROM expenses WHERE id = $1`, [expenseId], client);
}

/**
 * Where an expense sits in a list, newest first: by its date, then when it
 * was written (to the microsecond), then its id, so no two share a place.
 */
export interface ExpenseListKey {
  /** The expense's calendar day, "YYYY-MM-DD". */
  expenseDate: string;
  /** When it was written, from {@link exactTimeSql}. */
  createdAt: string;
  /** Its id, settling expenses written in the same microsecond. */
  id: string;
}

/** Which expenses a list shows. */
export type ExpenseListScope =
  | { kind: "group"; groupId: string }
  | { kind: "withUser"; userId: string; otherUserId: string }
  | { kind: "user"; userId: string }
  /** The user's own expenses outside any group. */
  | { kind: "userOneOff"; userId: string }
  /** The user's own expenses in one group. */
  | { kind: "userInGroup"; userId: string; groupId: string };

/** An expense row with its creation time to the microsecond, for its cursor. */
export type ListedExpenseRow = ExpenseRow & { created_at_exact: string };

/**
 * One page of an expense list, newest first: a group's expenses, the
 * one-off expenses two people share, or every expense a user is on. Deleted
 * rows are listed too, marked, so a payment made against one keeps the row
 * that explains it; balances read their own, deleted-excluded queries. The one
 * exception is a bill opened to the table and never filled in: it never had any
 * money, and nobody was ever told about it, so nothing needs it explained.
 *
 * @param scope - Which expenses the list shows.
 * @param after - The last expense of the previous page; null for the first.
 * @param limit - Most rows to return.
 * @param client - Snapshot client; omitted, the pool.
 * @returns The rows, newest first, each with its exact creation time.
 */
export async function listExpensePage(
  scope: ExpenseListScope,
  after: ExpenseListKey | null,
  limit: number,
  client?: PoolClient,
): Promise<ListedExpenseRow[]> {
  const values: unknown[] = [];
  const placeholderFor = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const conditions = ["NOT (expense.deleted_at IS NOT NULL AND expense.amount_cents = 0)"];
  if (scope.kind === "group") {
    conditions.push(`expense.group_id = ${placeholderFor(scope.groupId)}`);
  } else if (scope.kind === "withUser") {
    conditions.push(
      "expense.group_id IS NULL",
      expenseInvolvesSql(`= ${placeholderFor(scope.userId)}`),
      expenseInvolvesSql(`= ${placeholderFor(scope.otherUserId)}`),
    );
  } else if (scope.kind === "userOneOff") {
    conditions.push("expense.group_id IS NULL", expenseInvolvesSql(`= ${placeholderFor(scope.userId)}`));
  } else if (scope.kind === "userInGroup") {
    conditions.push(
      `expense.group_id = ${placeholderFor(scope.groupId)}`,
      expenseInvolvesSql(`= ${placeholderFor(scope.userId)}`),
    );
  } else {
    conditions.push(expenseInvolvesSql(`= ${placeholderFor(scope.userId)}`));
  }
  if (after) {
    conditions.push(
      `(expense.expense_date COLLATE "C", expense.created_at, expense.id)
         < (${placeholderFor(after.expenseDate)}::text COLLATE "C", ${placeholderFor(after.createdAt)}::timestamptz, ${placeholderFor(after.id)})`,
    );
  }
  const limitPlaceholder = placeholderFor(limit);
  return query<ListedExpenseRow>(
    `SELECT expense.*, ${exactTimeSql("expense.created_at")} AS created_at_exact
       FROM expenses expense
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY expense.expense_date COLLATE "C" DESC, expense.created_at DESC, expense.id DESC
      LIMIT ${limitPlaceholder}`,
    values,
    client,
  );
}

/**
 * Loads live expense parents for all requested ledger scopes at once.
 * @param groupIds - Group scopes whose balances are being assembled.
 * @param client - Snapshot or ledger transaction client.
 * @returns Live group expenses; no query is sent for an empty scope list.
 */
export async function listExpensesByGroups(groupIds: readonly string[], client?: PoolClient): Promise<ExpenseRow[]> {
  if (groupIds.length === 0) return [];
  return query<ExpenseRow>(
    "SELECT * FROM expenses WHERE group_id = ANY($1::text[]) AND deleted_at IS NULL",
    [[...new Set(groupIds)]], client,
  );
}

/**
 * One-off (non-group) expenses where both users participate (payer or ower).
 *
 * @param firstUserId - One of the two participants.
 * @param secondUserId - The other participant.
 * @param client - Optional transaction client holding the pair's ledger lock.
 * @returns Live one-off expense rows involving both users, newest first.
 */
export async function listOneOffExpensesBetween(
  firstUserId: string,
  secondUserId: string,
  client?: PoolClient,
): Promise<ExpenseRow[]> {
  return query<ExpenseRow>(
    `SELECT expense.* FROM expenses expense
     WHERE expense.group_id IS NULL AND expense.deleted_at IS NULL
       AND ${expenseInvolvesSql("= $1")}
       AND ${expenseInvolvesSql("= $2")}
     ORDER BY expense.expense_date DESC, expense.created_at DESC`,
    [firstUserId, secondUserId],
    client,
  );
}

/**
 * Live one-off (non-group) expenses the user shares with any of the given
 * people, for working out every one of those pair balances from one read
 * instead of one read per person.
 *
 * @param userId - The person every expense must include.
 * @param otherUserIds - People at least one of whom each expense must include too.
 * @param client - Snapshot or transaction client; omitted, the pool.
 * @returns The expenses; no query is sent for an empty list of people.
 */
export async function listOneOffExpensesWithAnyOf(
  userId: string,
  otherUserIds: readonly string[],
  client?: PoolClient,
): Promise<ExpenseRow[]> {
  if (otherUserIds.length === 0) return [];
  return query<ExpenseRow>(
    `SELECT expense.* FROM expenses expense
     WHERE expense.group_id IS NULL AND expense.deleted_at IS NULL
       AND ${expenseInvolvesSql("= $1")}
       AND ${expenseInvolvesSql("= ANY($2::text[])")}`,
    [userId, [...new Set(otherUserIds)]],
    client,
  );
}

/**
 * Every expense both users participate in, group ones included.
 *
 * The friend ledger totals across all shared scopes the way Splitwise's friend
 * screen does, so unlike {@link listOneOffExpensesBetween} this does not
 * restrict to `group_id IS NULL`.
 *
 * @param firstUserId - One of the two participants.
 * @param secondUserId - The other participant.
 * @param includeDeleted - Whether soft-deleted rows are returned too (display only).
 * @param client - Snapshot or transaction client; omitted, the pool.
 * @returns Expense rows involving both users, newest first.
 */
export async function listExpensesBetween(
  firstUserId: string,
  secondUserId: string,
  includeDeleted = false,
  client?: PoolClient,
): Promise<ListedExpenseRow[]> {
  return query<ListedExpenseRow>(
    `SELECT expense.*, ${exactTimeSql("expense.created_at")} AS created_at_exact
       FROM expenses expense
     WHERE ($3::boolean OR expense.deleted_at IS NULL)
       AND ${expenseInvolvesSql("= $1")}
       AND ${expenseInvolvesSql("= $2")}
     ORDER BY expense.expense_date DESC, expense.created_at DESC`,
    [firstUserId, secondUserId, includeDeleted],
    client,
  );
}

/**
 * One page of the expenses two people share (group and one-off, deleted
 * ones included), going back in time from `before` in the friend
 * statement's order: day, moment written, rank, id. The same order
 * {@link compareLedgerLineKeys} keeps in memory, ids compared by code point.
 *
 * @param firstUserId - One of the two people.
 * @param secondUserId - The other.
 * @param before - The oldest line already shown; null starts at the newest.
 * @param limit - Most rows to return.
 * @param client - Snapshot client.
 * @returns The rows, newest first, each with its exact creation time.
 */
export async function listExpensesBetweenPage(
  firstUserId: string,
  secondUserId: string,
  before: LedgerLineKey | null,
  limit: number,
  client: PoolClient,
): Promise<ListedExpenseRow[]> {
  return query<ListedExpenseRow>(
    `SELECT expense.*, ${exactTimeSql("expense.created_at")} AS created_at_exact
       FROM expenses expense
      WHERE ${expenseInvolvesSql("= $1")}
        AND ${expenseInvolvesSql("= $2")}
        AND ($3::text IS NULL
             OR (expense.expense_date COLLATE "C", expense.created_at, $7::int, expense.id COLLATE "C")
                < ($3::text COLLATE "C", $4::timestamptz, $5::int, $6::text COLLATE "C"))
      ORDER BY expense.expense_date COLLATE "C" DESC, expense.created_at DESC, expense.id COLLATE "C" DESC
      LIMIT $8`,
    [
      firstUserId,
      secondUserId,
      before?.day ?? null,
      before?.at ?? null,
      before?.rank ?? null,
      before?.id ?? null,
      LEDGER_LINE_RANK.expense,
      limit,
    ],
    client,
  );
}

/**
 * Every live expense the user pays for or owes on (groups + one-off), which
 * the balance math needs whole. A screen pages with {@link listExpensePage}.
 *
 * @param userId - Id of the user whose expenses to list.
 * @param client - Snapshot or transaction client; omitted, the pool.
 * @returns Expense rows involving the user, newest first.
 */
export async function listExpensesInvolvingUser(
  userId: string,
  client?: PoolClient,
): Promise<ExpenseRow[]> {
  return query<ExpenseRow>(
    `SELECT expense.* FROM expenses expense
     WHERE expense.deleted_at IS NULL
       AND ${expenseInvolvesSql("= $1")}
     ORDER BY expense.expense_date DESC, expense.created_at DESC`,
    [userId],
    client,
  );
}

/** Child rows for a batch of expenses, each map keyed by expense id. */
export interface ExpenseChildren {
  payers: Map<string, PayerRow[]>;
  splits: Map<string, SplitRow[]>;
  items: Map<string, (ItemRow & { assignments: ItemAssignmentRow[] })[]>;
}

/**
 * Batch-loads payers, splits and items (+assignments) for a set of expenses.
 *
 * @param expenseIds - Ids of the expenses whose child rows are needed.
 * @param client - Snapshot or transaction client.
 * @param includeItems - Whether receipt items and assignments are needed; false for balance math.
 * @returns Maps of expense id → child rows (empty maps for an empty input).
 */
export async function loadExpenseChildren(
  expenseIds: string[],
  client?: PoolClient,
  includeItems = true,
): Promise<ExpenseChildren> {
  const result: ExpenseChildren = {
    payers: new Map(),
    splits: new Map(),
    items: new Map(),
  };
  if (expenseIds.length === 0) return result;

  const loadPayers = () =>
    query<PayerRow>(
      `SELECT * FROM expense_payers WHERE expense_id = ANY($1::text[])`,
      [expenseIds],
      client,
    );
  const loadSplits = () =>
    query<SplitRow>(
      `SELECT * FROM expense_splits WHERE expense_id = ANY($1::text[])`,
      [expenseIds],
      client,
    );
  const loadItems = () =>
    includeItems ? query<ItemRow>(
      `SELECT * FROM expense_items WHERE expense_id = ANY($1::text[]) ORDER BY position, id`,
      [expenseIds],
      client,
    ) : Promise.resolve([] as ItemRow[]);
  // One connection runs one statement at a time, so on a transaction's
  // client these go in turn; only the pool can run them side by side.
  const [payers, splits, items] = client
    ? [await loadPayers(), await loadSplits(), await loadItems()]
    : await Promise.all([loadPayers(), loadSplits(), loadItems()]);

  for (const payerRow of payers) {
    const list = result.payers.get(payerRow.expense_id) ?? [];
    list.push(payerRow);
    result.payers.set(payerRow.expense_id, list);
  }
  for (const splitRow of splits) {
    const list = result.splits.get(splitRow.expense_id) ?? [];
    list.push(splitRow);
    result.splits.set(splitRow.expense_id, list);
  }

  const assignmentsByItem = new Map<string, ItemAssignmentRow[]>();
  if (items.length > 0) {
    const assignments = await query<ItemAssignmentRow>(
      `SELECT * FROM expense_item_assignments WHERE item_id = ANY($1::text[])`,
      [items.map((item) => item.id)],
      client,
    );
    for (const assignmentRow of assignments) {
      const list = assignmentsByItem.get(assignmentRow.item_id) ?? [];
      list.push(assignmentRow);
      assignmentsByItem.set(assignmentRow.item_id, list);
    }
  }
  for (const item of items) {
    const list = result.items.get(item.expense_id) ?? [];
    list.push({ ...item, assignments: assignmentsByItem.get(item.id) ?? [] });
    result.items.set(item.expense_id, list);
  }
  return result;
}
