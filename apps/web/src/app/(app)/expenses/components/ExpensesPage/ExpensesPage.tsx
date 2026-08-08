"use client";
/** All-expenses route UI: every expense you're on, searchable, filtered by scope. */

import Link from "next/link";
import { Plus } from "lucide-react";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { SearchField } from "@/components/ui/SearchField";
import { Spinner } from "@/components/ui/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { noExpensesMessage } from "../../constants/expenseFilters";
import { useExpensesList } from "./hooks/useExpensesList";

/**
 * Renders the all-expenses page: one list of every expense the user pays for
 * or owes on, group and one-off alike, searchable and narrowable by scope.
 *
 * This page exists because one-off expenses had no home of their own: they
 * were reachable only through the friend they were shared with, so "what
 * one-off expenses do I have?" had no answer. The One-off chip is that
 * answer; the group chips come along for free from the same filter.
 *
 * @returns The expenses page content, or a spinner while the list loads.
 */
export function ExpensesPage() {
  const listState = useExpensesList();
  const hydrated = useHydrated();
  if (!hydrated || listState.isLoading) return <Spinner label="Loading expenses…" />;

  const scopeChips = [
    { value: "all", label: "All" },
    { value: "oneoff", label: "One-off" },
    ...listState.groups.flatMap((summary) =>
      summary.group ? [{ value: summary.group.id, label: summary.group.name }] : [],
    ),
  ];
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
        {/* The count accounts for every active control, or it would read as
            unfiltered while rows are being hidden. */}
        {listState.query || listState.scope !== "all" ? (
          <span className="shrink-0 text-sm text-ink-soft tabular-nums">
            {listState.visibleExpenses.length} of {listState.expenses.length}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {scopeChips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            aria-pressed={listState.scope === chip.value}
            onClick={() => listState.setScope(chip.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              listState.scope === chip.value
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-line text-ink-soft hover:border-brand-200"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {listState.visibleExpenses.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-6 text-center text-sm text-ink-soft">
          {noExpensesMessage(listState.query, listState.scope, filteredGroupName)}
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
    </div>
  );
}
