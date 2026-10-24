"use client";
/** Segmented control: a short row of mutually exclusive options on a paper track. */

/**
 * Renders a row of equal-width options where exactly one is selected. Styled
 * like the friends tabs and the expense form's split-type tabs, so every
 * "pick one of a few" control in the app reads as the same thing.
 *
 * A toggle group rather than a tablist: the same control switches a view on
 * one screen and scopes a chart on another, and "pressed" is true of both.
 *
 * @param props - Component props.
 * @returns The control.
 */
export function SegmentedControl<OptionValue extends string | number>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  /** The selectable options, in display order. */
  options: readonly { value: OptionValue; label: string }[];
  /** The selected option's value. */
  value: OptionValue;
  /** Called with the option the person picked. */
  onChange: (next: OptionValue) => void;
  /** What the control chooses between, for assistive technology. */
  label: string;
  /** "sm" for a control that sits inside a card's filter row. */
  size?: "sm" | "md";
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-grid auto-cols-fr grid-flow-col rounded-xl bg-paper p-1 font-semibold ring-1 ring-line ${
        size === "sm" ? "text-xs" : "text-sm"
      }`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-lg whitespace-nowrap transition-colors ${
              size === "sm" ? "px-2.5 py-1.5" : "px-4 py-2"
            } ${selected ? "bg-card text-brand-700 shadow-sm" : "text-ink-soft hover:text-ink"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
