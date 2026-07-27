"use client";
/** Search input with a leading icon and a clear button. */

import { Search, X } from "lucide-react";

/**
 * Renders a labelled search box: a magnifier, the input, and a clear button
 * that appears once there is something to clear.
 *
 * `type="search"` rather than `type="text"` so mobile keyboards offer a
 * "search" key and browsers expose their own clear affordance where they have
 * one — the button here is for the ones that don't.
 *
 * @param props - Component props.
 * @returns The search field.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  autoFocus = false,
  className = "",
}: {
  /** Current query text. */
  value: string;
  /** Called with the new query on every keystroke. */
  onChange: (value: string) => void;
  /** Placeholder shown while empty; also names the field for screen readers. */
  placeholder: string;
  /** Accessible label; falls back to the placeholder. */
  label?: string;
  /** Whether to focus the input on mount (only for fields the user just opened). */
  autoFocus?: boolean;
  /** Extra classes for the wrapper. */
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-soft" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="w-full rounded-xl border border-line bg-card py-2.5 pr-9 pl-9 text-base focus:border-brand-500 sm:text-sm focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-paper hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
