"use client";
/** Author line: who wrote the reported content, whether they are suspended, and what else of theirs waits. */

/**
 * Renders the author's display name (or that it is withheld), a Suspended
 * mark, and how many other reports about their content are waiting.
 *
 * @param props - Component props.
 * @returns The line.
 */
export function AuthorLine({
  name,
  suspended,
  othersWaiting,
}: {
  /** The display name to show, already replaced when withheld. */
  name: string;
  /** Whether they are suspended now. */
  suspended: boolean;
  /** Other reported items by the same person still waiting. */
  othersWaiting: number;
}) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
      <span>
        By <span className="font-semibold text-ink">{name}</span>
      </span>
      {suspended ? (
        <span className="rounded-full bg-neg-50 px-2 py-0.5 text-xs font-semibold text-neg-700">
          Suspended
        </span>
      ) : null}
      {othersWaiting > 0 ? (
        <span>
          {othersWaiting === 1 ? "1 more report" : `${othersWaiting} more reports`} about their content
          waiting
        </span>
      ) : null}
    </p>
  );
}
