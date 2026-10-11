"use client";
/** The starting points of a new payment method: a wallet, a bank account, one of the built-in apps, or a blank form. */

import { METHOD_TEMPLATES } from "@haalkhata/shared/payment/templates";

/**
 * Renders the starting points as chips. Picking one only fills the form in;
 * every field it fills stays editable.
 *
 * @param props - Component props.
 * @returns The chip row, which wraps onto more lines on a narrow screen.
 */
export function StartingPoints({
  selected,
  onPick,
}: {
  /** Key of the starting point the form is currently shaped by. */
  selected: string;
  /** Called with the key of the starting point picked. */
  onPick: (templateKey: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Start from</p>
      <div className="flex flex-wrap gap-1.5">
        {METHOD_TEMPLATES.map((template) => (
          <button
            key={template.key}
            type="button"
            aria-pressed={selected === template.key}
            onClick={() => onPick(template.key)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              selected === template.key
                ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                : "border-line text-ink-soft hover:border-brand-200"
            }`}
          >
            {template.label}
          </button>
        ))}
      </div>
    </div>
  );
}
