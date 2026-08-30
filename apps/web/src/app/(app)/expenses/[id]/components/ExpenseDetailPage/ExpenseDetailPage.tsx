"use client";
/** Expense detail page: payers, splits, receipt items, comments, and delete flow. */

import Link from "next/link";
import { Check, Lock, Pencil, Send, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { PersonLink } from "@/components/people/PersonLink";
import { settledStatus } from "@/components/expenses/settledStatus";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { formatMoney } from "@haalkhata/shared/money/money";
import { localDateTime } from "@haalkhata/shared/time/localTime";
import { itemShareCents } from "@haalkhata/shared/expense/splits";
import { useExpenseDetail } from "./hooks/useExpenseDetail";
import { MAX_COMMENT_LENGTH } from "@haalkhata/shared/text/limits";

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
  const hydrated = useHydrated();

  if (!hydrated || expenseDetail.isLoading) return <Spinner label="Loading expense…" />;
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

  // The viewer's net on this expense, for the nothing-pending banner: the
  // banner only makes sense when they had a stake, and its wording depends
  // on which direction that stake pointed.
  const meId = expenseDetail.me?.id;
  const myPaidCents = expense.payers
    .filter((payer) => payer.userId === meId)
    .reduce((total, payer) => total + payer.amountCents, 0);
  const myOwedCents = expense.splits
    .filter((split) => split.userId === meId)
    .reduce((total, split) => total + split.owedCents, 0);
  const myNetCents = myPaidCents - myOwedCents;
  // Anyone on the expense may correct it — creator, payer or ower — because
  // each can see the mistake and each is affected by it. Deletion stays with
  // the creator. Neither is refused once a payment has been recorded in the
  // ledger after the expense: the derived balance rebalances against what
  // was paid, so the page warns rather than hides. A deleted expense is
  // frozen history — no actions, though comments stay open — with the row
  // kept so any payment made against it still has its explanation.
  const isCreator = expense.createdBy === meId;
  const isParticipant =
    isCreator ||
    expense.payers.some((payer) => payer.userId === meId) ||
    expense.splits.some((split) => split.userId === meId);
  const hasLaterSettlement = expenseDetail.detail?.hasLaterSettlement === true;
  const isDeleted = expense.deletedAt !== "";
  const deletion = expenseDetail.deletion;
  // Same wording as the list rows, from the same function — the list's
  // tooltip is invisible on phones, so this page is where the full sentence
  // actually gets read.
  const settled =
    expenseDetail.detail?.settledForViewer && myNetCents !== 0
      ? settledStatus(
          myNetCents > 0,
          expense.groupId !== "",
          [
            ...new Set(
              [...expense.payers.map((payer) => payer.userId), ...expense.splits.map((split) => split.userId)]
                .filter((participantId) => participantId !== meId)
                .map((participantId) => expenseDetail.userById.get(participantId)?.name.split(" ")[0])
                .filter((name): name is string => Boolean(name)),
            ),
          ],
        )
      : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold sm:text-3xl ${isDeleted ? "text-ink-soft line-through" : ""}`}>
            {expense.description}
          </h1>
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

      {/* The full nothing-pending sentence. On the list this rides as a
          hover tooltip, which phones cannot see — the page every row taps
          through to is where it actually gets read. */}
      {settled ? (
        <p className="flex items-start gap-2 rounded-2xl border border-pos-600/20 bg-pos-50 px-4 py-3 text-sm font-medium text-pos-700">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{settled.explanation}</span>
        </p>
      ) : null}

      {isDeleted ? (
        <p className="flex items-start gap-2 rounded-2xl border border-line bg-paper px-4 py-3 text-sm text-ink-soft">
          <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Deleted
            {deletion?.actor
              ? ` by ${deletion.actor.id === meId ? "you" : deletion.actor.name}`
              : ""}{" "}
            {localDateTime(deletion?.createdAt || expense.deletedAt)}. It no longer counts toward
            anyone&apos;s balance; any payment made against it stays on the ledger.
          </span>
        </p>
      ) : null}

      {isParticipant && !isDeleted ? (
        <div className="flex gap-2">
          <Link
            href={`/expenses/new?edit=${expense.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-ink-soft hover:border-brand-200"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
          {isCreator ? (
            <button
              type="button"
              onClick={() => expenseDetail.setConfirmingDelete(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          ) : null}
        </div>
      ) : null}

      {isParticipant && !isDeleted && hasLaterSettlement ? (
        <p className="flex items-start gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink-soft">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Somebody has paid against this ledger since this expense was added. Editing or
            deleting it rebalances what they owe — or are owed — against what has already been
            paid.
          </span>
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Paid by
          </h2>
          <ul className="space-y-2">
            {expense.payers.map((payer) => (
              <li key={payer.userId} className="flex items-center gap-2 text-sm">
                <PersonLink
                  userId={payer.userId}
                  meId={meId}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  {expenseDetail.userById.get(payer.userId) ? (
                    <Avatar user={expenseDetail.userById.get(payer.userId)!} size="sm" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{displayName(payer.userId)}</span>
                </PersonLink>
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
                <PersonLink
                  userId={split.userId}
                  meId={meId}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  {expenseDetail.userById.get(split.userId) ? (
                    <Avatar user={expenseDetail.userById.get(split.userId)!} size="sm" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{displayName(split.userId)}</span>
                </PersonLink>
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
            {expense.items.map((item) => {
              // Recomputed with the same allocate() the split itself used, so
              // the figure on the line is the one that fed the stored total —
              // rounding cent and all. null means you are not on this item,
              // which is a different thing from owing nothing on it.
              const myShare = expenseDetail.me
                ? itemShareCents(item, expenseDetail.me.id)
                : null;
              return (
                <li key={item.id} className="py-2.5 text-sm">
                  <div className="flex items-center gap-3">
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
                    <Money
                      cents={item.totalCents}
                      currency={expense.currency}
                      className="font-medium"
                    />
                  </div>
                  {/* The question the avatars alone cannot answer: am I on this,
                      and for how much. Stated rather than left to be worked out
                      from a row of overlapping faces. */}
                  <p className="mt-0.5 text-right text-xs">
                    {myShare === null ? (
                      <span className="text-ink-soft">not yours</span>
                    ) : (
                      <span className="font-medium text-pos-700">
                        your share {formatMoney(myShare, expense.currency)}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
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

      {/* Only when something actually changed. Every expense has a creation
          event, so rendering the history unconditionally would put a section
          on every page to say "nothing has happened", which is noise. The
          creation line is included once there IS an edit, because "edited"
          only means something next to when it was made. */}
      {expenseDetail.changes.length > 0 ? (
        <section className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
            History
          </h2>
          <ul className="space-y-1.5">
            {expenseDetail.detail?.history.map((event, index) => (
              <li
                key={`${event.type}-${event.createdAt}-${index}`}
                className="flex items-center gap-2 text-sm text-ink-soft"
              >
                {event.actor ? (
                  <PersonLink userId={event.actor.id} meId={meId}>
                    <Avatar user={event.actor} size="sm" />
                  </PersonLink>
                ) : null}
                <span className="min-w-0 flex-1 truncate">
                  {event.actor ? (
                    <PersonLink
                      userId={event.actor.id}
                      meId={meId}
                      className="font-medium text-ink"
                    >
                      {displayName(event.actor.id)}
                    </PersonLink>
                  ) : (
                    <span className="font-medium text-ink">Someone</span>
                  )}{" "}
                  {event.type === "expense_added"
                    ? "created this"
                    : event.type === "expense_deleted"
                      ? "deleted this"
                      : "edited this"}
                </span>
                <time className="shrink-0 text-xs tabular-nums">
                  {localDateTime(event.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Comments */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">Comments</h2>
        {(expenseDetail.detail?.comments ?? []).map((comment) => (
          <div key={comment.id} className="flex gap-3 rounded-xl border border-line bg-card p-3">
            {comment.author ? (
              <PersonLink userId={comment.author.id} meId={meId}>
                <Avatar user={comment.author} size="sm" />
              </PersonLink>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-soft">
                {comment.author ? (
                  <PersonLink
                    userId={comment.author.id}
                    meId={meId}
                    className="font-semibold text-ink"
                  >
                    {comment.author.name}
                  </PersonLink>
                ) : null}{" "}
                · {localDateTime(comment.createdAt)}
              </p>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{comment.body}</p>
            </div>
          </div>
        ))}
        {/* Open on deleted expenses too: "why was this removed?" is exactly
            the conversation the kept row is there to host. */}
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
            maxLength={MAX_COMMENT_LENGTH}
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
            “{expense.description}” ({formatMoney(expense.amountCents, expense.currency)}) will stop
            counting toward anyone&apos;s balance. It stays visible, marked deleted, and any payment
            already made against it stays on the ledger.
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
