"use client";
/** The all-expenses page's results: the first page loading or failing, the rows, and Show more. */

import { ExpenseList } from "@/components/expenses/ExpenseList/ExpenseList";
import { ErrorAlert } from "@/components/ui/ErrorAlert/ErrorAlert";
import { LoadMoreFooter } from "@/components/ui/LoadMoreFooter/LoadMoreFooter";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { noExpensesMessage } from "@haalkhata/shared/expense/scopeFilter";
import type { useExpensesList } from "../../hooks/useExpensesList";

/**
 * Renders what sits under the page's filters. A scope's first page is
 * loading, failed, empty, or listed; under a listed one sits Show more, with
 * a failed next page said just above it. Only this part changes when a chip
 * is switched, so the filters never jump.
 *
 * @param props - Component props.
 * @returns The results.
 */
export function ExpensesResults({
  listState,
  filteredGroupName,
}: {
  /** The page's data and controls, from `useExpensesList`. */
  listState: ReturnType<typeof useExpensesList>;
  /** The filtered group's name when the scope is a group; "" otherwise. */
  filteredGroupName: string;
}) {
  if (listState.isLoading) return <Spinner label="Loading expenses…" />;
  if (listState.loadError) {
    return (
      <ErrorAlert
        message={`Couldn't load your expenses: ${listState.loadError}`}
        onRetry={listState.retry}
      />
    );
  }

  return (
    <>
      {listState.visibleExpenses.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-6 text-center text-sm text-ink-soft">
          {noExpensesMessage(listState.query, listState.scope, filteredGroupName, listState.hasMore)}
        </p>
      ) : (
        <ExpenseList
          expenses={listState.visibleExpenses}
          meId={listState.me?.id}
          userById={listState.userById}
          emptyHint=""
          groupNameById={listState.groupNameById}
          settledIds={listState.settledIds}
        />
      )}
      <LoadMoreFooter
        hasMore={listState.hasMore}
        isLoadingMore={listState.isLoadingMore}
        onLoadMore={listState.loadMore}
        error={listState.loadMoreError}
        endLabel={listState.expenses.length > 0 ? "That's the oldest one." : ""}
      />
    </>
  );
}
