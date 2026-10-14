"use client";
/** Stepper: a minus / count / plus control for small integers, used for an item's quantity and each person's portions. */

/**
 * A minus / count / plus control for small integers.
 *
 * @param props - Component props.
 * @returns The stepper.
 */
export function Stepper({
  value,
  min,
  max,
  label,
  onChange,
}: {
  /** The current count. */
  value: number;
  /** Lowest count the minus button may reach. */
  min: number;
  /** Highest count the plus button may reach. */
  max: number;
  /** Suffix for the buttons' accessible labels, e.g. "for Adnan". */
  label: string;
  /** Called with the new count. */
  onChange: (next: number) => void;
}) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-card">
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label={`One fewer ${label}`}
        className="h-8 w-8 text-base leading-none hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
      >
        −
      </button>
      <output className="min-w-7 text-center text-sm font-semibold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label={`One more ${label}`}
        className="h-8 w-8 text-base leading-none hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
      >
        +
      </button>
    </span>
  );
}
