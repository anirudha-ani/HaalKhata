/** New/edit expense orchestrator: loads data, then mounts ExpenseForm with resolved initial values. */

import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { buildInitialValues } from "../../utils/initialValues";
import { ExpenseForm } from "./components/ExpenseForm/ExpenseForm";
import { useNewExpenseAPI } from "./hooks/useNewExpenseAPI";

/**
 * Orchestrator: loads data, then mounts the form with fully-resolved initial
 * values (keyed by expense id so edit → create never reuses stale state).
 * Every split type is editable here, itemized receipts included — the form
 * reloads their lines and assignments into the same editor a fresh scan fills.
 *
 * @param props - Component props.
 * @returns The new/edit expense screen content.
 */
export function NewExpenseScreen({
  initialGroupId,
  initialFriendId,
  editExpenseId,
}: {
  /** Group id from the ?group= param, preselecting the group context ("" = none). */
  initialGroupId: string;
  /** Friend id from the ?friend= param, preselecting a one-off context ("" = none). */
  initialFriendId: string;
  /** Expense id from the ?edit= param, or "" when creating a new expense. */
  editExpenseId: string;
}) {
  const expenseAPI = useNewExpenseAPI(editExpenseId);
  const isEdit = editExpenseId !== "";

  if (expenseAPI.isLoading || !expenseAPI.me) {
    return (
      <Screen header={<DetailHeader title={isEdit ? "Edit expense" : "Add expense"} />}>
        <Spinner />
      </Screen>
    );
  }

  const initial = buildInitialValues(
    { initialGroupId, initialFriendId },
    expenseAPI.me.id,
    expenseAPI.editing?.expense,
  );

  return (
    <Screen header={<DetailHeader title={isEdit ? "Edit expense" : "Add expense"} />}>
      <ExpenseForm
        api={expenseAPI}
        editExpenseId={editExpenseId}
        initial={initial}
        key={editExpenseId || "new"}
      />
    </Screen>
  );
}
