"use client";
/** New/edit expense form: receipt scan, context picker, basics, payer + split editors, submit. */

import { CATEGORIES } from "@haalkhata/shared/money/money.constants";
import { centsToInput } from "@haalkhata/shared/money/money";
import { PeoplePicker } from "@/components/people/PeoplePicker";
import { SplitSummary } from "@/components/expense/SplitSummary";
import { ErrorPopup } from "@/components/ui/ErrorPopup";
import { itemizedWarnings } from "@/lib/expense/itemizedWarnings";
import { parseMoneyInput } from "@haalkhata/shared/money/money";
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
  // On desktop the form always has a sticky sidebar: the receipt scanner (or
  // the photo, once there is one) and a who-owes-what panel for whichever
  // split is selected, so the numbers are beside the fields all the way
  // down. On a phone the same things stack in the flow, and an itemized
  // split carries its own summary strip instead of the panel.
  const isItemized = form.isItemized;
  const summaryWarnings = isItemized
    ? itemizedWarnings(form.items, currency)
    : !form.splitCheck.ok && form.totalCents !== null
      ? [form.splitCheck.message]
      : [];
  // The same numbers twice: a panel in the desktop sidebar, a strip that
  // sticks to the bottom of a phone's scroller under the Split section.
  const summaryProps = {
    people: form.people,
    currentUserId: form.me?.id ?? "",
    currency,
    shares: form.previewShares,
    totalCents: form.totalCents ?? 0,
    breakdown: isItemized
      ? {
          itemsTotalCents: form.itemsTotalCents,
          taxCents: parseMoneyInput(form.taxInput, currency) ?? 0,
          tipCents: parseMoneyInput(form.tipInput, currency) ?? 0,
        }
      : undefined,
    warnings: summaryWarnings,
    ready: isItemized ? form.items.length > 0 : (form.totalCents ?? 0) > 0,
    readyMessage: isItemized ? "Everything is assigned" : "Adds up to the total",
  };

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
        scopeLocked={form.isEdit}
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
              value={form.isItemized ? centsToInput(form.totalCents ?? 0, currency) : form.amount}
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
      <SplitSummary layout="strip" className="lg:hidden" {...summaryProps} />

      <textarea
        className={`${inputClass} min-h-20 text-base sm:text-sm`}
        placeholder="Notes (optional)"
        aria-label="Notes"
        maxLength={MAX_EXPENSE_NOTES_LENGTH}
        value={form.notes}
        onChange={(event) => form.setNotes(event.target.value)}
      />

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
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-3xl font-bold">{form.isEdit ? "Edit expense" : "Add expense"}</h1>

      {/* The phone track is minmax(0,1fr), not the implicit auto: an auto
          track grows to its content's max-content width, and the receipt
          scanner's labels alone pushed the page to 863px on a 390px phone. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
          {/* Editing cannot re-scan: an itemized expense is not editable here
              at all (the page guards it), and re-parsing a photo over a saved
              non-itemized expense would silently convert it. */}
          {form.isEdit ? null : <ReceiptPanel form={form} />}
          <SplitSummary layout="panel" className="hidden lg:block" {...summaryProps} />
        </div>
        <div className="min-w-0 space-y-6">{fields}</div>
      </div>
      {/* Errors from scanning and saving alike: pinned to the viewport rather
          than printed above the submit button, which on a phone is a screen
          away from the receipt panel that produced most of them. */}
      <ErrorPopup message={form.error} onDismiss={form.dismissError} />
    </div>
  );
}
