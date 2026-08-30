"use client";
/** Expense list rows: category, payer summary, and your lent/borrowed net per expense. */

import Link from "next/link";
import { Check, ReceiptText } from "lucide-react";
import type { Expense } from "@haalkhata/protogen/expense/v1/expense_pb";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { formatMoney } from "@haalkhata/shared/money/money";
import { CATEGORY_EMOJI } from "./categoryEmoji";
import { settledStatus } from "@haalkhata/shared/expense/settledStatus";

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
  groupNameById,
  settledIds,
}: {
  /** Expenses to render, newest-first as returned by the server. */
  expenses: Expense[];
  /** The signed-in user's id, used to compute their lent/borrowed net per row. */
  meId: string | undefined;
  /** Lookup from user id to User for naming payers. */
  userById: Map<string, User>;
  /** Hint text for the empty state when there are no expenses. */
  emptyHint: string;
  /**
   * Group names keyed by id. When given, each row carries a pill naming which
   * group it belongs to ("one-off" when none) — for lists that mix scopes,
   * where a row's home is not implied by the page it is on. A single group's
   * page omits this.
   */
  groupNameById?: Map<string, string>;
  /**
   * Ids of expenses with nothing pending for the viewer (their balance in
   * the expense's scope is zero). Rows in it trade the lent/borrowed label
   * for the truthful state — "no one owes you here" / "you owe nothing
   * here" — and mute the amount into history.
   */
  settledIds?: Set<string>;
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

        // A deleted expense stays in the list, struck through: it no longer
        // moves any balance, but a payment made against it keeps the row
        // that explains it.
        const deleted = expense.deletedAt !== "";
        const settled = settledIds?.has(expense.id) ?? false;
        // Everyone else on the expense, for the one-off wording — group rows
        // speak of the group instead and never read this.
        const otherFirstNames = settled
          ? [
              ...new Set(
                [...expense.payers.map((payer) => payer.userId), ...expense.splits.map((split) => split.userId)]
                  .filter((participantId) => participantId !== meId)
                  .map((participantId) => userById.get(participantId)?.name.split(" ")[0])
                  .filter((name): name is string => Boolean(name)),
              ),
            ]
          : [];
        const status = settled
          ? settledStatus(myNet > 0, expense.groupId !== "", otherFirstNames)
          : null;
        return (
          <li key={expense.id}>
            <Link
              href={`/expenses/${expense.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-paper/60"
            >
              <span className="text-xl">{CATEGORY_EMOJI[expense.category] ?? "🧾"}</span>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${deleted ? "text-ink-soft line-through" : ""}`}>
                  {expense.description}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
                  {deleted ? (
                    <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 font-medium text-ink-soft">
                      deleted
                    </span>
                  ) : null}
                  {/* The row's home as a pill, not buried in the meta text —
                      on a mixed list, where an expense lives is the first
                      thing being scanned for. */}
                  {groupNameById ? (
                    <span
                      className={`max-w-32 shrink-0 truncate rounded-full px-2 py-0.5 font-medium ${
                        expense.groupId
                          ? "bg-brand-50 text-brand-700"
                          : "bg-paper text-ink-soft"
                      }`}
                    >
                      {expense.groupId
                        ? (groupNameById.get(expense.groupId) ?? "group")
                        : "one-off"}
                    </span>
                  ) : null}
                  <span className="truncate">
                    {expense.expenseDate} · {payerLabel}{" "}
                    {formatMoney(expense.amountCents, expense.currency)}
                    {expense.splitType === "itemized" ? " · itemized" : ""}
                  </span>
                </p>
              </div>
              <div className="text-right">
                {deleted ? (
                  <span className="text-xs text-ink-soft">no longer counts</span>
                ) : myNet === 0 ? (
                  <span className="text-xs text-ink-soft">not involved / even</span>
                ) : status ? (
                  <>
                    {/* The state, not a verdict on the expense: "settled"
                        here would claim this row was paid off, which the
                        ledger never tracks — scopes reach zero, sometimes
                        with no payment at all. So the label says what is
                        true in the viewer's direction, and the tooltip
                        carries the full sentence. */}
                    <p
                      title={status.explanation}
                      className="flex items-center justify-end gap-1 text-xs font-medium text-pos-600"
                    >
                      <Check className="h-3.5 w-3.5 shrink-0" /> {status.label}
                    </p>
                    {/* Unsigned on purpose: the sign colors say "money is
                        pending", and nothing is. */}
                    <Money
                      cents={myNet}
                      currency={expense.currency}
                      className="text-sm font-semibold text-ink-soft"
                    />
                  </>
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
