"use client";
/** Route-level error boundary for the authenticated (app) segment. */

import Link from "next/link";
import { useEffect } from "react";

/**
 * Catches unexpected errors thrown from any route under (app)/* and renders
 * a safe fallback with a link back to the dashboard, instead of Next's
 * default error page with no escape route. Next.js treats a file named
 * `error.tsx` at a segment as that segment's error boundary.
 *
 * @param props - Error-boundary props.
 * @param props.error - The error that was thrown.
 * @param props.reset - Callback to attempt re-rendering the route.
 * @returns The fallback UI.
 */
export default function AppError({
  error,
  reset,
}: {
  /** The error that was thrown in the route subtree. */
  error: Error & { digest?: string };
  /** Attempts to re-render the errored route segment. */
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error in the server logs for debugging.
    console.error("route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h2 className="font-display text-xl text-ink">Something went wrong</h2>
      <p className="text-sm text-ink-soft">
        An unexpected error occurred while loading this page.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
