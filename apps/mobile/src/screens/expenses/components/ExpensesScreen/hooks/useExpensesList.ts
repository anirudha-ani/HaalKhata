/** Composite hook for the all-expenses screen: API data + search + scope filter. */

import { useMemo, useState } from "react";
import type { ExpenseScopeFilter } from "@haalkhata/shared/expense/scopeFilter";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { useExpensesAPI } from "./useExpensesAPI";

/**
 * Combines the expenses API data with the screen's narrowing state: a scope
 * filter (all / one-off / one group), which the server applies, and a
 * search query over description, category and group, which narrows the
 * pages loaded so far — so the count is stated against what is loaded.
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
