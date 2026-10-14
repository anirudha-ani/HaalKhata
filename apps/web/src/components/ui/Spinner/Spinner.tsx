/** Centered loading spinner with optional label. */

/** Renders a centered spinning-ring loading indicator with an optional text label beneath it. */
export function Spinner({
  label,
}: {
  /** Text shown under the spinner (e.g. "Loading groups…"). */
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-soft">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-brand-600" />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}
