"use client";
/** Split section: split-type tabs plus per-person participation and value inputs. */

import { Avatar } from "@/components/ui/Avatar";
import { SPLIT_TABS, UNIT } from "../../../../constants/splitEditor";
import type { NewExpenseController } from "../../hooks/useNewExpense";

/**
 * Renders the "Split" section of the expense form: split-type tabs, a
 * per-person list with participation checkboxes and (for non-equal splits)
 * value inputs, plus either the split validation message or the equal-split
 * per-person summary.
 *
 * @param props - Component props.
 * @returns The split editor section.
 */
export function SplitEditor({
  form,
}: {
  /** The expense-form controller from useNewExpense that owns all split state. */
  form: NewExpenseController;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">Split</h2>

      <div className="grid grid-cols-4 rounded-xl bg-paper p-1 text-sm font-semibold ring-1 ring-line">
        {SPLIT_TABS.map((splitTab) => (
          <button
            key={splitTab.value}
            type="button"
            onClick={() => form.setSplitType(splitTab.value)}
            className={`rounded-lg py-2 transition-colors ${
              form.splitType === splitTab.value
                ? "bg-card text-brand-700 shadow-sm"
                : "text-ink-soft"
            }`}
          >
            {splitTab.label}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
        {form.people.map((person) => {
          const isChecked = form.checked[person.id] ?? false;
          return (
            <li key={person.id} className="flex items-center gap-3 px-4 py-2.5">
              <input
                type="checkbox"
                id={`split-${person.id}`}
                checked={isChecked}
                onChange={(event) =>
                  form.setChecked({ ...form.checked, [person.id]: event.target.checked })
                }
                className="h-4 w-4 accent-brand-600"
              />
              <label
                htmlFor={`split-${person.id}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5"
              >
                <Avatar user={person} size="sm" />
                <span className="truncate text-sm font-medium">
                  {person.id === form.me?.id ? "You" : person.name}
                </span>
              </label>
              {form.splitType !== "equal" && isChecked ? (
                <span className="flex items-center gap-1 text-sm text-ink-soft">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    aria-label={`${form.splitType} value for ${person.name}`}
                    value={form.splitInputs[person.id] ?? ""}
                    onChange={(event) =>
                      form.setSplitInputs({
                        ...form.splitInputs,
                        [person.id]: event.target.value,
                      })
                    }
                    className="w-20 rounded-lg border border-line bg-paper px-2 py-1.5 text-right tabular-nums focus:border-brand-500 focus:outline-none"
                  />
                  {UNIT[form.splitType]}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!form.splitCheck.ok && form.totalCents !== null ? (
        <p className="text-sm font-medium text-neg-600">{form.splitCheck.message}</p>
      ) : form.splitType === "equal" && form.participantIds.length > 0 && form.totalCents ? (
        <p className="text-sm text-ink-soft">
          {(form.totalCents / 100 / form.participantIds.length).toFixed(2)} each ·{" "}
          {form.participantIds.length} people
        </p>
      ) : null}
    </section>
  );
}
