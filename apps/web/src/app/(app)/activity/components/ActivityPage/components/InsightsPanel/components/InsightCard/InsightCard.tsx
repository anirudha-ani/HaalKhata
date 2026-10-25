/** Insight card: the titled frame every block of the insights dashboard sits in. */

import type { ReactNode } from "react";

/**
 * Renders a card with a title, an optional line saying what the figures
 * mean, and the block's content.
 *
 * @param props - Component props.
 * @returns The card.
 */
export function InsightCard({
  title,
  subtitle,
  className = "",
  children,
}: {
  /** What the block shows. */
  title: string;
  /** How to read it, when the title alone leaves that open. */
  subtitle?: string;
  /** Extra classes for the card, e.g. a grid span. */
  className?: string;
  /** The block's content. */
  children: ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-card p-4 ${className}`}>
      <header className="mb-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}
