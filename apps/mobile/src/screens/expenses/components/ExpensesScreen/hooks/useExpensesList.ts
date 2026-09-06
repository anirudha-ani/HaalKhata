/** Composite hook for the all-expenses screen: API data + search + scope filter. */

import { useMemo, useState } from "react";
import { matchesScopeFilter, type ExpenseScopeFilter } from "@haalkhata/shared/expense/scopeFilter";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { useExpensesAPI } from "./useExpensesAPI";

/**
 * Combines the expenses API data with the screen's narrowing state: a search
 * query over description and category, and a scope filter (all / one-off /
 * one group). Both narrow together, the way the groups screen's search and
 * balance filter do.
 *
 * @returns Everything from {@link useExpensesAPI} plus `visibleExpenses`,
 *   `groupNameById` (for row labels and the empty message), and the
 *   `query`/`scope` state with their setters.
 */
export function useExpensesList() {
  const expensesAPI = useExpensesAPI();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ExpenseScopeFilter>("all");

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
    return expensesAPI.expenses.filter((expense) => {
      if (!matchesScopeFilter(expense.groupId, scope)) return false;
      return (
        terms.length === 0 ||
        matchesTerms(
          terms,
          expense.description,
          expense.category,
          // A group's name is part of how people remember an expense
          // ("that goa dinner"), so it is searchable text too.
          expense.groupId ? groupNameById.get(expense.groupId) : "one-off",
        )
      );
    });
  }, [expensesAPI.expenses, groupNameById, query, scope]);

  return { ...expensesAPI, visibleExpenses, groupNameById, query, setQuery, scope, setScope };
}
