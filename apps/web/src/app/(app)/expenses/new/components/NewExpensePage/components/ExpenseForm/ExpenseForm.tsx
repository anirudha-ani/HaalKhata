"use client";
/** New/edit expense form: receipt scan, context picker, basics, payer + split editors, submit. */

import { CATEGORIES } from "@haalkhata/shared/money/money.constants";
import { centsToInput } from "@haalkhata/shared/money/money";
import { PeoplePicker } from "@/components/people/PeoplePicker";
import type { ExpenseFormInitial } from "../../../../utils/initialValues";
import { PayerEditor } from "../PayerEditor/PayerEditor";
import { ReceiptPanel } from "../ReceiptPanel/ReceiptPanel";
import { SplitEditor } from "../SplitEditor/SplitEditor";
import { useNewExpense } from "../../hooks/useNewExpense";
import type { useNewExpenseAPI } from "../../hooks/useNewExpenseAPI";
import { MAX_EXPENSE_DESCRIPTION_LENGTH, MAX_EXPENSE_NOTES_LENGTH } from "@haalkhata/shared/text/limits";

/** Shared className for the text-style inputs and selects in this form. */
const inputClass =
  "w-full rounded-xl border border-line bg-card px-3.5 py-3 focus:border-brand-500 focus:outline-none";

/**
 * Renders the full expense form: the receipt scanner, the group/friend
 * context picker, the basic fields (description, amount, date, category), the
 * payer and split editors, optional notes, validation errors, and submit.
 *
 * Scanning is part of this form rather than a route of its own, because a
 * scanned receipt and a hand-entered itemized bill save the identical row —
 * the photo just fills the fields in for you.
 *
 * @param props - Component props.
 * @returns The expense form for creating or editing an expense.
 */
export function ExpenseForm({
  api: expenseAPI,
  initial,
  editExpenseId,
}: {
  /** Query/mutation bundle from useNewExpenseAPI, owned by the page orchestrator. */
  api: ReturnType<typeof useNewExpenseAPI>;
  /** Fully-resolved initial field values (create defaults or the expense being edited). */
  initial: ExpenseFormInitial;
  /** Id of the expense being edited, or "" when creating a new one. */
  editExpenseId: string;
}) {
  const form = useNewExpense(expenseAPI, initial, editExpenseId);
  const currency = form.selectedGroup?.currency ?? form.me?.defaultCurrency ?? "USD";
  // Once there is a photo to check the numbers against, it earns a column of
  // its own — sticky, so it stays beside the item grid all the way down.
  const hasReceipt = form.receiptUrl !== "";

  const fields = (
    <>
      <PeoplePicker
        me={form.me}
        people={form.people}
        friends={form.friends.flatMap((friendship) => (friendship.user ? [friendship.user] : []))}
        groups={form.groups.flatMap((summary) => (summary.group ? [summary.group] : []))}
        groupId={form.groupId}
        friendIds={form.friendIds}
        onGroupChange={form.setGroupId}
        onToggleFriend={form.toggleFriend}
        disabled={form.isEdit}
      />

      <section className="space-y-3">
        <input
          className={inputClass}
          placeholder="What was it for?"
          aria-label="Description"
          maxLength={MAX_EXPENSE_DESCRIPTION_LENGTH}
          value={form.description}
          onChange={(event) => form.setDescription(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-ink-soft">
            Amount ({currency})
            {/* Itemized totals are derived from the line items, so the field
                becomes a read-only readout of items + tax + tip. */}
            <input
              className={`${inputClass} mt-1 text-lg tabular-nums ${
                form.isItemized ? "text-ink-soft" : ""
              }`}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              readOnly={form.isItemized}
              title={form.isItemized ? "Calculated from the items below" : undefined}
              value={form.isItemized ? centsToInput(form.totalCents ?? 0) : form.amount}
              onChange={(event) => form.setAmount(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-ink-soft">
            Date
            <input
              className={`${inputClass} mt-1`}
              type="date"
              value={form.date}
              onChange={(event) => form.setDate(event.target.value)}
            />
          </label>
        </div>
        {/* Category chips scroll rather than wrap on a phone: wrapping eleven
            of them costs three rows of vertical space above the split editor,
            which is the part people came here to use. */}
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          {CATEGORIES.map((categoryOption) => (
            <button
              key={categoryOption}
              type="button"
              onClick={() => form.setCategory(categoryOption)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium capitalize sm:py-1.5 ${
                form.category === categoryOption
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-line text-ink-soft"
              }`}
            >
              {categoryOption}
            </button>
          ))}
        </div>
      </section>

      <PayerEditor form={form} />
      <SplitEditor form={form} currency={currency} />

      <textarea
        className={`${inputClass} min-h-20 text-base sm:text-sm`}
        placeholder="Notes (optional)"
        aria-label="Notes"
        maxLength={MAX_EXPENSE_NOTES_LENGTH}
        value={form.notes}
        onChange={(event) => form.setNotes(event.target.value)}
      />

      {form.error ? <p className="text-sm font-medium text-brand-600">{form.error}</p> : null}

      <button
        type="button"
        onClick={form.submit}
        disabled={!form.canSubmit || form.isSaving}
        className="min-h-12 w-full rounded-xl bg-brand-600 py-3.5 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
      >
        {form.isSaving ? "Saving…" : form.isEdit ? "Save changes" : "Add expense"}
      </button>
    </>
  );

  return (
    <div className={`mx-auto space-y-6 ${hasReceipt ? "max-w-6xl" : "max-w-xl"}`}>
      <h1 className="text-3xl font-bold">{form.isEdit ? "Edit expense" : "Add expense"}</h1>

      {/* Editing cannot re-scan: an itemized expense is not editable here at
          all (the page guards it), and re-parsing a photo over a saved
          non-itemized expense would silently convert it. */}
      {form.isEdit ? (
        <div className="space-y-6">{fields}</div>
      ) : (
        <div
          className={
            hasReceipt ? "grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]" : "space-y-6"
          }
        >
          <div className={hasReceipt ? "lg:sticky lg:top-6 lg:self-start" : ""}>
            <ReceiptPanel form={form} />
          </div>
          <div className="space-y-6">{fields}</div>
        </div>
      )}
    </div>
  );
}
