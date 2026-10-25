"use client";
/** Reported words: what was reported, exactly as the server copied it. */

/**
 * Renders the reported text, and for an expense its notes and item names.
 * Always as text, never as markup, wrapping however long it is.
 *
 * @param props - Component props.
 * @returns The words.
 */
export function ReportedWords({
  text,
  notes,
  itemNames,
}: {
  /** The comment, description, group name or display name. */
  text: string;
  /** An expense's notes; empty otherwise. */
  notes: string;
  /** An expense's item names; empty otherwise. */
  itemNames: readonly string[];
}) {
  return (
    <>
      <blockquote className="mt-3 border-l-4 border-line pl-3 text-base break-words whitespace-pre-wrap">
        {text || <span className="text-ink-soft">(no text)</span>}
      </blockquote>
      {notes ? (
        <p className="mt-2 text-sm break-words whitespace-pre-wrap">
          <span className="font-semibold">Notes: </span>
          {notes}
        </p>
      ) : null}
      {itemNames.length > 0 ? (
        <p className="mt-2 text-sm break-words">
          <span className="font-semibold">Items: </span>
          {itemNames.join(", ")}
        </p>
      ) : null}
    </>
  );
}
