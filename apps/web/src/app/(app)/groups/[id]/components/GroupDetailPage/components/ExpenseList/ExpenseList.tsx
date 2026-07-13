"use client";
/** Expense list rows: category, payer summary, and your lent/borrowed net per expense. */

import Link from "next/link";
import { ReceiptText } from "lucide-react";
import type { Expense } from "@haalkhata/protogen/expense/v1/expense_pb";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { formatMoney } from "@/lib/money/money";
import { CATEGORY_EMOJI } from "../../../../constants/categoryEmoji";

/**
 * Group-agnostic expense list with a "your share" lens per row: each expense
 * links to its detail page and shows the category emoji, who paid, and how
 * much the viewer lent or borrowed on it.
 *
 * @returns The expense rows, or an empty state when there are no expenses.
 */
export function ExpenseList({
  expenses,
  meId,
  userById,
  emptyHint,
}: {
  /** Expenses to render, newest-first as returned by the server. */
  expenses: Expense[];
  /** The signed-in user's id, used to compute their lent/borrowed net per row. */
  meId: string | undefined;
  /** Lookup from user id to User for naming payers. */
  userById: Map<string, User>;
  /** Hint text for the empty state when there are no expenses. */
  emptyHint: string;
}) {
  if (expenses.length === 0) {
    return <EmptyState icon={<ReceiptText />} title="No expenses yet" hint={emptyHint} />;
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {expenses.map((expense) => {
        // The viewer's net on this expense: what they paid minus what they owe.
        const paid = expense.payers
          .filter((payer) => payer.userId === meId)
          .reduce((totalCents, payer) => totalCents + payer.amountCents, 0);
        const owed = expense.splits
          .filter((split) => split.userId === meId)
          .reduce((totalCents, split) => totalCents + split.owedCents, 0);
        const myNet = paid - owed;
        const firstPayer = expense.payers[0]
          ? (userById.get(expense.payers[0].userId)?.name ?? "someone")
          : "someone";
        const payerLabel =
          expense.payers.length > 1
            ? `${expense.payers.length} people paid`
            : expense.payers[0]?.userId === meId
              ? "you paid"
              : `${firstPayer} paid`;

        return (
          <li key={expense.id}>
            <Link
              href={`/expenses/${expense.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-paper/60"
            >
              <span className="text-xl">{CATEGORY_EMOJI[expense.category] ?? "🧾"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{expense.description}</p>
                <p className="text-xs text-ink-soft">
                  {expense.expenseDate} · {payerLabel}{" "}
                  {formatMoney(expense.amountCents, expense.currency)}
                  {expense.splitType === "itemized" ? " · itemized" : ""}
                </p>
              </div>
              <div className="text-right">
                {myNet === 0 ? (
                  <span className="text-xs text-ink-soft">not involved / even</span>
                ) : (
                  <>
                    <p className={`text-xs ${myNet > 0 ? "text-pos-600" : "text-neg-600"}`}>
                      {myNet > 0 ? "you lent" : "you borrowed"}
                    </p>
                    <Money
                      cents={myNet}
                      currency={expense.currency}
                      signed
                      className="text-sm font-semibold"
                    />
                  </>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
