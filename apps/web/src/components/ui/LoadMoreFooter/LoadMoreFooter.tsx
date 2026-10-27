"use client";
/** The control under a paged list: Show more, why the last page did not load, or the end of the list. */

import { ChevronDown } from "lucide-react";
import { ErrorAlert } from "@/components/ui/ErrorAlert/ErrorAlert";
import { SHOW_MORE_LABEL } from "@haalkhata/shared/api/paging";

/**
 * Renders what sits under the rows of a paged list. A failed page is said
 * just above Show more, which is the way to ask for it again, so the error
 * is where the person is looking and never mistaken for the end of the
 * list. A notice (the list was read again because it changed) sits there
 * too. Once there is nothing further, a line says the end was reached.
 *
 * @param props - Component props.
 * @returns The footer, or nothing for an empty list with no more to load.
 */
export function LoadMoreFooter({
  hasMore,
  isLoadingMore,
  onLoadMore,
  error,
  notice = "",
  endLabel,
  label = SHOW_MORE_LABEL,
}: {
  /** Whether older rows remain to be loaded. */
  hasMore: boolean;
  /** True while the next page is on its way. */
  isLoadingMore: boolean;
  /** Asks for the next page. */
  onLoadMore: () => void;
  /** Why the next page did not load; "" when it did. */
  error: string;
  /** Something the person should know about the list itself; "" for nothing. */
  notice?: string;
  /** What the end of the list says; "" says nothing. */
  endLabel: string;
  /** What the button says. */
  label?: string;
}) {
  return (
    <>
      {notice ? (
        <p role="status" className="text-center text-xs text-ink-soft">
          {notice}
        </p>
      ) : null}
      {hasMore ? (
        <>
          {error ? <ErrorAlert message={`Couldn't load more: ${error}`} /> : null}
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-card py-3 text-sm font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
            {isLoadingMore ? "Loading…" : label}
          </button>
        </>
      ) : endLabel ? (
        <p className="pb-2 text-center text-xs text-ink-soft">{endLabel}</p>
      ) : null}
    </>
  );
}
