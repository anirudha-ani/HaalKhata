/** Stat tile: one headline number under its label. */

/**
 * Renders a single figure with a label above it and an optional line of
 * context below. The form for a number that is the whole story: a one-bar
 * chart would say nothing this does not.
 *
 * The value uses the font's proportional figures. Tabular figures give every
 * digit the width of a zero, which makes a large standalone number look
 * loose; they belong in columns that must line up, not here.
 *
 * @param props - Component props.
 * @returns The tile.
 */
export function StatTile({
  label,
  value,
  hint,
}: {
  /** What the number counts, in sentence case. */
  label: string;
  /** The figure, already formatted. */
  value: string;
  /** Optional context under the figure, e.g. what a subset of it is. */
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-card px-3 py-2.5">
      <p className="truncate text-xs text-ink-soft">{label}</p>
      <p className="mt-0.5 truncate text-xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}
