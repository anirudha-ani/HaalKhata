"use client";
/** Load error: why an admin view could not load, with a way to try again. */

import { ErrorAlert } from "@/components/ui/ErrorAlert/ErrorAlert";

/**
 * Renders a failed load at the top of an admin view. When the view still
 * holds an earlier read, it says so, so stale figures or a stale queue are
 * never passed off as current.
 *
 * @param props - Component props.
 * @returns The alert.
 */
export function LoadError({
  what,
  message,
  staleNote,
  onRetry,
}: {
  /** What failed to load, e.g. "usage". */
  what: string;
  /** The server's or the network's reason. */
  message: string;
  /** What is still on screen from the last good read; empty when nothing is. */
  staleNote: string;
  /** Loads again. */
  onRetry: () => void;
}) {
  return (
    <ErrorAlert
      message={`Couldn't load ${what}: ${message}${staleNote ? `. ${staleNote}` : ""}`}
      onRetry={onRetry}
    />
  );
}
