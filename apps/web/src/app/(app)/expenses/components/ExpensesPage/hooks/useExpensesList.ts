"use client";
/** Composite hook for the all-expenses page: API data + search + scope filter. */

import { useMemo, useState } from "react";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import type { ExpenseScopeFilter } from "@haalkhata/shared/expense/scopeFilter";
import { useExpensesAPI } from "./useExpensesAPI";

/**
 * Combines the expenses API data with the page's narrowing state: a search
 * query over description and category, and a scope filter (all / one-off /
 * one group). The scope is read by the server, a page at a time; the search
 * narrows the rows loaded so far, the way the activity feed's does, so the
 * page states its count against what is loaded.
 *
 * @returns Everything from {@link useExpensesAPI} plus `visibleExpenses`,
 *   `groupNameById` (for row labels and the empty message), and the
 *   `query`/`scope` state with their setters.
 */
export function useExpensesList() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ExpenseScopeFilter>("all");
  const expensesAPI = useExpensesAPI(scope);

  const groupNameById = useMemo(
    () =>
      new Map(
        expensesAPI.groups.flatMap((summary) =>
          summary.group ? [[summary.group.id, summary.group.name] as const] : [],
        ),
      ),
    [expensesAPI.groups],
  );

  const visibleExpenses = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return expensesAPI.expenses;
    return expensesAPI.expenses.filter((expense) =>
      matchesTerms(
        terms,
        expense.description,
        expense.category,
        // A group's name is part of how people remember an expense
        // ("that goa dinner"), so it is searchable text too.
        expense.groupId ? groupNameById.get(expense.groupId) : "one-off",
      ),
    );
  }, [expensesAPI.expenses, groupNameById, query]);

  return { ...expensesAPI, visibleExpenses, groupNameById, query, setQuery, scope, setScope };
}
