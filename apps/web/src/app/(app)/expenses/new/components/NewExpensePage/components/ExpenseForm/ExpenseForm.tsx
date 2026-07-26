"use client";
/** New/edit expense form: context picker, basics (amount/date/category), payer + split editors, submit. */

import Link from "next/link";
import { CATEGORIES } from "@haalkhata/shared/money/money.constants";
import type { ExpenseFormInitial } from "../../../../utils/initialValues";
import { PayerEditor } from "../PayerEditor/PayerEditor";
import { SplitEditor } from "../SplitEditor/SplitEditor";
import { useNewExpense } from "../../hooks/useNewExpense";
import type { useNewExpenseAPI } from "../../hooks/useNewExpenseAPI";

/** Shared className for the text-style inputs and selects in this form. */
const inputClass =
  "w-full rounded-xl border border-line bg-card px-3.5 py-3 focus:border-brand-500 focus:outline-none";

/**
 * Renders the full expense form: the group/friend context picker, the basic
 * fields (description, amount, date, category), the payer and split editors,
 * optional notes, validation errors, and the submit button.
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

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl font-bold">{form.isEdit ? "Edit expense" : "Add expense"}</h1>

      <section className="space-y-3">
        <select
          value={form.context}
          onChange={(event) => form.setContext(event.target.value)}
          disabled={form.isEdit}
          aria-label="Who is this with?"
          className={inputClass}
        >
          <option value="" disabled>
            Who is this with?
          </option>
          {form.groups.length > 0 ? (
            <optgroup label="Groups">
              {form.groups.map((summary) =>
                summary.group ? (
                  <option key={summary.group.id} value={`g:${summary.group.id}`}>
                    {summary.group.name}
                  </option>
                ) : null,
              )}
            </optgroup>
          ) : null}
          {form.friends.length > 0 ? (
            <optgroup label="Friends (one-off)">
              {form.friends.map((friend) =>
                friend.user ? (
                  <option key={friend.user.id} value={`f:${friend.user.id}`}>
                    {friend.user.name}
                  </option>
                ) : null,
              )}
            </optgroup>
          ) : null}
        </select>
        {form.groups.length === 0 && form.friends.length === 0 ? (
          <p className="text-sm text-ink-soft">
            You need a <Link href="/groups" className="font-medium text-brand-600">group</Link> or a{" "}
            <Link href="/friends" className="font-medium text-brand-600">friend</Link> first.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <input
          className={inputClass}
          placeholder="What was it for?"
          aria-label="Description"
          value={form.description}
          onChange={(event) => form.setDescription(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-ink-soft">
            Amount ({currency})
            <input
              className={`${inputClass} mt-1 text-lg tabular-nums`}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={form.amount}
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
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((categoryOption) => (
            <button
              key={categoryOption}
              type="button"
              onClick={() => form.setCategory(categoryOption)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${
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
      <SplitEditor form={form} />

      <textarea
        className={`${inputClass} min-h-20 text-sm`}
        placeholder="Notes (optional)"
        aria-label="Notes"
        value={form.notes}
        onChange={(event) => form.setNotes(event.target.value)}
      />

      {form.error ? <p className="text-sm font-medium text-brand-600">{form.error}</p> : null}

      <button
        type="button"
        onClick={form.submit}
        disabled={!form.canSubmit || form.isSaving}
        className="w-full rounded-xl bg-brand-600 py-3.5 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
      >
        {form.isSaving ? "Saving…" : form.isEdit ? "Save changes" : "Add expense"}
      </button>
    </div>
  );
}
