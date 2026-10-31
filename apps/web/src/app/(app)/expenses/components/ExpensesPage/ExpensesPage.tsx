"use client";
/** All-expenses route UI: every expense you're on, searchable, filtered by scope. */

import Link from "next/link";
import { Plus } from "lucide-react";
import { SearchField } from "@/components/ui/SearchField/SearchField";
import { Spinner } from "@/components/ui/Spinner/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { ExpensesResults } from "./components/ExpensesResults/ExpensesResults";
import { ScopeFilter } from "./components/ScopeFilter/ScopeFilter";
import { useExpensesList } from "./hooks/useExpensesList";

/**
 * Renders the all-expenses page: one list of every expense the user pays for
 * or owes on, group and one-off alike, searchable and narrowable by scope.
 *
 * This page exists because one-off expenses had no home of their own: they
 * were reachable only through the friend they were shared with, so "what
 * one-off expenses do I have?" had no answer. The One-off chip is that
 * answer; filtering by one group comes along for free from the same filter.
 *
 * The list arrives a page at a time, newest first, with Show more under it.
 * The header and the filters stay put while a scope's first page loads, so
 * switching chips swaps only the rows.
 *
 * @returns The expenses page content, or a spinner before hydration.
 */
export function ExpensesPage() {
  const listState = useExpensesList();
  const hydrated = useHydrated();
  if (!hydrated) return <Spinner label="Loading expenses…" />;

  const filteredGroupName = listState.groupNameById.get(listState.scope) ?? "";

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Expenses</h1>
        <Link
          href="/expenses/new"
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Add expense
        </Link>
      </header>

      <div className="flex items-center gap-3">
        <SearchField
          className="flex-1"
          value={listState.query}
          onChange={listState.setQuery}
          placeholder="Search by description, category, or group"
        />
        {/* The search narrows the rows loaded so far, so the count is stated
            against those, and says so while older ones remain. */}
        {listState.query && !listState.isLoading ? (
          <span className="shrink-0 text-sm text-ink-soft tabular-nums">
            {listState.visibleExpenses.length} of {listState.expenses.length}
            {listState.hasMore ? " loaded" : ""}
          </span>
        ) : null}
      </div>

      <ScopeFilter
        scope={listState.scope}
        onScopeChange={listState.setScope}
        groups={listState.groups.flatMap((summary) =>
          summary.group ? [{ id: summary.group.id, name: summary.group.name }] : [],
        )}
      />

      <ExpensesResults listState={listState} filteredGroupName={filteredGroupName} />
    </div>
  );
}
