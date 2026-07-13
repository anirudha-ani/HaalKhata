"use client";
/** New/edit expense orchestrator: loads data, guards itemized edits, mounts ExpenseForm. */

import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { buildInitialValues } from "../../utils/initialValues";
import { ExpenseForm } from "./components/ExpenseForm/ExpenseForm";
import { useNewExpenseAPI } from "./hooks/useNewExpenseAPI";

/**
 * Orchestrator: loads data, then mounts the form with fully-resolved initial
 * values (keyed by expense id so edit → create never reuses stale state).
 * Itemized (receipt) expenses cannot be edited here, so it renders a guard
 * screen linking back to the expense instead.
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

  if (expenseAPI.isLoading || !expenseAPI.me) return <Spinner />;

  if (expenseAPI.editing?.expense?.splitType === "itemized") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-card p-6">
        <h1 className="text-xl font-semibold">Itemized expense</h1>
        <p className="mt-2 text-ink-soft">
          Itemized (receipt) expenses can&apos;t be edited here yet — delete it and
          re-scan the receipt instead.
        </p>
        <Link
          href={`/expenses/${expenseAPI.editing.expense.id}`}
          className="mt-4 inline-block rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Back to expense
        </Link>
      </div>
    );
  }

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
