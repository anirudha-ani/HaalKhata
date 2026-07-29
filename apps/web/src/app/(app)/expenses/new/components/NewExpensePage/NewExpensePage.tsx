"use client";
/** New/edit expense orchestrator: loads data, mounts ExpenseForm. */

import { Spinner } from "@/components/ui/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { buildInitialValues } from "../../utils/initialValues";
import { ExpenseForm } from "./components/ExpenseForm/ExpenseForm";
import { useNewExpenseAPI } from "./hooks/useNewExpenseAPI";

/**
 * Orchestrator: loads data, then mounts the form with fully-resolved initial
 * values (keyed by expense id so edit → create never reuses stale state).
 *
 * @param props - Component props.
 * @returns The new/edit expense page content.
 */
export function NewExpensePage({
  initialGroupId,
  initialFriendId,
  editExpenseId,
}: {
  /** Group id from the ?group= search param, preselecting the group context ("" = none). */
  initialGroupId: string;
  /** Friend id from the ?friend= search param, preselecting a one-off context ("" = none). */
  initialFriendId: string;
  /** Expense id from the ?edit= search param, or "" when creating a new expense. */
  editExpenseId: string;
}) {
  const expenseAPI = useNewExpenseAPI(editExpenseId);
  const hydrated = useHydrated();

  if (!hydrated || expenseAPI.isLoading || !expenseAPI.me) return <Spinner />;

  const initial = buildInitialValues(
    { initialGroupId, initialFriendId },
    expenseAPI.me.id,
    expenseAPI.editing?.expense,
  );

  return (
    <ExpenseForm
      key={editExpenseId || "new"}
      api={expenseAPI}
      initial={initial}
      editExpenseId={editExpenseId}
    />
  );
}
