"use client";
/** Summary card: one balance stat on the dashboard, a label over a formatted amount. */

/**
 * Renders one balance-summary stat card with a label and a formatted amount.
 *
 * @param props - Component props.
 * @returns A single summary card.
 */
export function SummaryCard({
  label,
  value,
  tone,
  strong = false,
}: {
  /** Caption shown above the amount (e.g. "You are owed"). */
  label: string;
  /** Pre-formatted money string to display. */
  value: string;
  /** Color treatment: "pos" for money owed to you, "neg" for money you owe. */
  tone: "pos" | "neg";
  /** When true, tints the card background to emphasize it (used for net balance). */
  strong?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-line p-4 ${
        strong ? (tone === "pos" ? "bg-pos-50" : "bg-neg-50") : "bg-card"
      }`}
    >
      <p className="text-sm text-ink-soft">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          tone === "pos" ? "text-pos-600" : "text-neg-600"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
