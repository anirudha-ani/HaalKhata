/** Expense rows → expense.v1 message init shapes. */

import type {
  ExpenseChildren,
  ExpenseRow,
} from "@/server/expense/repo/expenses.repo";
import type { SettlementRow } from "@/server/expense/repo/settlements.repo";

/**
 * Maps an expense row plus its batch-loaded child rows to the expense.v1
 * Expense message init shape (camelCase proto fields; a null group becomes "").
 *
 * @param expenseRow - Expense row from the database.
 * @param children - Child rows for a batch of expenses, keyed by expense id.
 * @returns A plain object matching the Expense proto message fields.
 */
export function toExpense(expenseRow: ExpenseRow, children: ExpenseChildren) {
  return {
    id: expenseRow.id,
    groupId: expenseRow.group_id ?? "",
    description: expenseRow.description,
    amountCents: expenseRow.amount_cents,
    currency: expenseRow.currency,
    category: expenseRow.category,
    expenseDate: expenseRow.expense_date,
    splitType: expenseRow.split_type,
    notes: expenseRow.notes,
    createdBy: expenseRow.created_by,
    createdAt: expenseRow.created_at,
    taxCents: expenseRow.tax_cents,
    tipCents: expenseRow.tip_cents,
    payers: (children.payers.get(expenseRow.id) ?? []).map((payer) => ({
      userId: payer.user_id,
      amountCents: payer.amount_cents,
    })),
    splits: (children.splits.get(expenseRow.id) ?? []).map((split) => ({
      userId: split.user_id,
      owedCents: split.owed_cents,
    })),
    items: (children.items.get(expenseRow.id) ?? []).map((item) => ({
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
 * Maps a settlement row to the expense.v1 Settlement message init shape
 * (camelCase proto fields; a null group becomes "").
 *
 * @param settlementRow - Settlement row from the database.
 * @returns A plain object matching the Settlement proto message fields.
 */
export function toSettlement(settlementRow: SettlementRow) {
  return {
    id: settlementRow.id,
    groupId: settlementRow.group_id ?? "",
    fromUserId: settlementRow.from_user,
    toUserId: settlementRow.to_user,
    amountCents: settlementRow.amount_cents,
    currency: settlementRow.currency,
    method: settlementRow.method,
    note: settlementRow.note,
    createdAt: settlementRow.created_at,
  };
}
