"use client";
/** "Paid by" section: single-payer select or per-person multi-payer amounts. */

import { Avatar } from "@/components/ui/Avatar";
import type { NewExpenseController } from "../../hooks/useNewExpense";

/**
 * Renders the "Paid by" section of the expense form: a toggle between a
 * single-payer select and a per-person amount list for multiple payers, plus
 * the payer validation message when amounts don't add up.
 *
 * @param props - Component props.
 * @returns The payer editor section.
 */
export function PayerEditor({
  form,
}: {
  /** The expense-form controller from useNewExpense that owns all payer state. */
  form: NewExpenseController;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">Paid by</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={form.multiPayer}
            onChange={(event) => form.setMultiPayer(event.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          multiple people paid
        </label>
      </div>

      {form.multiPayer ? (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {form.people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar user={person} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {person.id === form.me?.id ? "You" : person.name}
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                aria-label={`Amount paid by ${person.name}`}
                value={form.payerAmounts[person.id] ?? ""}
                onChange={(event) =>
                  form.setPayerAmounts({ ...form.payerAmounts, [person.id]: event.target.value })
                }
                className="w-24 rounded-lg border border-line bg-paper px-2 py-1.5 text-right tabular-nums focus:border-brand-500 focus:outline-none"
              />
            </li>
          ))}
        </ul>
      ) : (
        <select
          aria-label="Paid by"
          value={form.singlePayerId}
          onChange={(event) => form.setSinglePayerId(event.target.value)}
          className="w-full rounded-xl border border-line bg-card px-3 py-2.5 focus:border-brand-500 focus:outline-none"
        >
          {form.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.id === form.me?.id ? "You" : person.name}
            </option>
          ))}
        </select>
      )}

      {!form.payerCheck.ok ? (
        <p className="text-sm font-medium text-neg-600">{form.payerCheck.message}</p>
      ) : null}
    </section>
  );
}
