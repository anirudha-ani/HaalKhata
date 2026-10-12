"use client";
/** The "preferred" box of a payment method, and the warning that it takes the star from another. */

/**
 * Renders the box that stars a method for its currency.
 *
 * One method per currency can carry the star, so ticking this can un-star
 * another. That is said here, before saving, by name: finding a different
 * row starred in the list afterwards would read as the app changing its mind.
 *
 * @param props - Component props.
 * @returns The box, its explanation, and the warning when a star would move.
 */
export function PreferredField({
  preferred,
  currencyName,
  displacedName,
  onChange,
}: {
  /** Whether the box is ticked. */
  preferred: boolean;
  /** What to call the method's currency: a code, or "any currency". */
  currencyName: string;
  /** Name of the method that would lose its star; empty when none would. */
  displacedName: string;
  /** Called when the box is ticked or unticked. */
  onChange: (preferred: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-start gap-2 py-1 text-sm">
        <input
          type="checkbox"
          checked={preferred}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        <span>
          Make this my preferred method for {currencyName}
          <span className="block text-xs text-ink-soft">
            It is shown first, and selected, when someone settles up with you.
          </span>
        </span>
      </label>
      {displacedName ? (
        <p className="pl-6 text-xs font-medium text-neg-700">
          This replaces {displacedName} as your preferred method for {currencyName}.
        </p>
      ) : null}
    </div>
  );
}
