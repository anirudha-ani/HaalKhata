"use client";
/** Expense detail page: payers, splits, receipt items, comments, and delete flow. */

import Link from "next/link";
import { Pencil, Send, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { formatMoney } from "@/lib/money/money";
import { useExpenseDetail } from "./hooks/useExpenseDetail";

/**
 * Renders a single expense: header (description, date, category, amount),
 * edit/delete actions, payer and split breakdowns, receipt items when
 * itemized, notes, the comment thread with a composer, and a delete
 * confirmation modal.
 *
 * @param props - Component props.
 * @param props.expenseId - Id of the expense to load and display.
 * @returns The expense detail page content.
 */
export function ExpenseDetailPage({ expenseId }: { expenseId: string }) {
  const expenseDetail = useExpenseDetail(expenseId);

  if (expenseDetail.isLoading) return <Spinner label="Loading expense…" />;
  const expense = expenseDetail.detail?.expense;
  if (!expense) {
    return (
      <p className="rounded-2xl border border-line bg-card p-6 text-ink-soft">
        {expenseDetail.detailError ? errorMessage(expenseDetail.detailError) : "Expense not found."}
      </p>
    );
  }

  /** Display name for a user id: "You" for the viewer, the user's name otherwise. */
  const displayName = (userId: string) =>
    userId === expenseDetail.me?.id
      ? "You"
      : (expenseDetail.userById.get(userId)?.name ?? "someone");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{expense.description}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {expense.expenseDate} · <span className="capitalize">{expense.category}</span>
            {expense.groupId ? (
              <>
                {" · "}
                <Link href={`/groups/${expense.groupId}`} className="text-brand-600">
                  view group
                </Link>
              </>
            ) : (
              " · one-off"
            )}
          </p>
        </div>
        <p className="shrink-0 text-2xl font-bold tabular-nums">
          {formatMoney(expense.amountCents, expense.currency)}
        </p>
      </header>

      <div className="flex gap-2">
        {expense.splitType !== "itemized" ? (
          <Link
            href={`/expenses/new?edit=${expense.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-ink-soft hover:border-brand-200"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => expenseDetail.setConfirmingDelete(true)}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Paid by
          </h2>
          <ul className="space-y-2">
            {expense.payers.map((payer) => (
              <li key={payer.userId} className="flex items-center gap-2 text-sm">
                {expenseDetail.userById.get(payer.userId) ? (
                  <Avatar user={expenseDetail.userById.get(payer.userId)!} size="sm" />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{displayName(payer.userId)}</span>
                <Money cents={payer.amountCents} currency={expense.currency} className="font-medium" />
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Split · {expense.splitType}
          </h2>
          <ul className="space-y-2">
            {expense.splits.map((split) => (
              <li key={split.userId} className="flex items-center gap-2 text-sm">
                {expenseDetail.userById.get(split.userId) ? (
                  <Avatar user={expenseDetail.userById.get(split.userId)!} size="sm" />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{displayName(split.userId)}</span>
                <Money cents={split.owedCents} currency={expense.currency} className="font-medium" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {expense.items.length > 0 ? (
        <section className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Receipt items
          </h2>
          <ul className="divide-y divide-line">
            {expense.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {item.quantity > 1 ? `${item.quantity}× ` : ""}
                  {item.name}
                </span>
                <span className="flex -space-x-1.5">
                  {item.assignments.map((assignment) =>
                    expenseDetail.userById.get(assignment.userId) ? (
                      <Avatar
                        key={assignment.userId}
                        user={expenseDetail.userById.get(assignment.userId)!}
                        size="sm"
                        ring
                      />
                    ) : null,
                  )}
                </span>
                <Money cents={item.totalCents} currency={expense.currency} className="font-medium" />
              </li>
            ))}
          </ul>
          {expense.taxCents > 0 || expense.tipCents > 0 ? (
            <p className="mt-3 border-t border-line pt-3 text-right text-sm text-ink-soft">
              {expense.taxCents > 0
                ? `tax ${formatMoney(expense.taxCents, expense.currency)}`
                : null}
              {expense.taxCents > 0 && expense.tipCents > 0 ? " · " : null}
              {expense.tipCents > 0
                ? `tip ${formatMoney(expense.tipCents, expense.currency)}`
                : null}
            </p>
          ) : null}
        </section>
      ) : null}

      {expense.notes ? (
        <p className="rounded-2xl border border-line bg-card p-4 text-sm whitespace-pre-wrap text-ink-soft">
          {expense.notes}
        </p>
      ) : null}

      {/* Comments */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">Comments</h2>
        {(expenseDetail.detail?.comments ?? []).map((comment) => (
          <div key={comment.id} className="flex gap-3 rounded-xl border border-line bg-card p-3">
            {comment.author ? <Avatar user={comment.author} size="sm" /> : null}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-soft">
                <span className="font-semibold text-ink">{comment.author?.name}</span> ·{" "}
                {comment.createdAt.slice(0, 16).replace("T", " ")}
              </p>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{comment.body}</p>
            </div>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            expenseDetail.submitComment();
          }}
        >
          <input
            value={expenseDetail.comment}
            onChange={(event) => expenseDetail.setComment(event.target.value)}
            placeholder="Add a comment…"
            aria-label="Add a comment"
            className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={expenseDetail.isCommenting || expenseDetail.comment.trim() === ""}
            aria-label="Send comment"
            className="rounded-xl bg-brand-600 px-4 text-white hover:bg-brand-700 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>

      {expenseDetail.error ? (
        <p className="text-sm font-medium text-brand-600">{expenseDetail.error}</p>
      ) : null}

      {expenseDetail.confirmingDelete ? (
        <Modal title="Delete expense?" onClose={() => expenseDetail.setConfirmingDelete(false)}>
          <p className="text-sm text-ink-soft">
            “{expense.description}” ({formatMoney(expense.amountCents, expense.currency)}) will be
            removed from everyone&apos;s balances.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => expenseDetail.setConfirmingDelete(false)}
              className="rounded-xl border border-line py-2.5 font-semibold"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={expenseDetail.remove}
              disabled={expenseDetail.isRemoving}
              className="rounded-xl bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {expenseDetail.isRemoving ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
