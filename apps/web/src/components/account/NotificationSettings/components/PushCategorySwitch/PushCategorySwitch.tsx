"use client";
/** One push category: its name, what it covers, a switch, and that switch's own error. */

import type { PushCategory } from "@haalkhata/shared/notifications/categories";
import { PUSH_CATEGORY_COPY, PUSH_COPY } from "@haalkhata/shared/notifications/copy";

/** Props for {@link PushCategorySwitch}. */
interface PushCategorySwitchProps {
  category: PushCategory;
  enabled: boolean;
  /** This switch is saving. */
  saving: boolean;
  /** Another switch is saving; this one waits. */
  locked: boolean;
  error: string;
  /** Asks to set the switch; on a failed save, Retry asks again for the same state. */
  onChange: (enabled: boolean) => void;
}

/**
 * @param props - The category, its state and its handler.
 * @returns A labelled switch with its failure shown right under it.
 */
export function PushCategorySwitch({ category, enabled, saving, locked, error, onChange }: PushCategorySwitchProps) {
  const copy = PUSH_CATEGORY_COPY[category];
  const inputId = `push-switch-${category}`;
  return (
    <div className="space-y-1 py-2">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={inputId} className="min-w-0">
          <span className="block text-sm font-medium">{copy.label}</span>
          <span className="block text-xs text-ink-soft">{copy.hint}</span>
        </label>
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          aria-checked={enabled}
          checked={enabled}
          disabled={saving || locked}
          onChange={(event) => onChange(event.target.checked)}
          className="relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:transition-transform checked:bg-brand-600 checked:before:translate-x-5 disabled:opacity-60"
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-neg-700">
          {error}{" "}
          <button type="button" className="underline" onClick={() => onChange(!enabled)}>
            {PUSH_COPY.retry}
          </button>
        </p>
      ) : null}
    </div>
  );
}
