"use client";
/** New/edit expense orchestrator: loads data, mounts ExpenseForm. */

import { Spinner } from "@/components/ui/Spinner/Spinner";
import Link from "next/link";
import { ARCHIVED_GROUP_HINT, GROUP_ARCHIVE_ACTIONS } from "@haalkhata/shared/group/archiving";
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

  const requestedGroupId = editExpenseId
    ? expenseAPI.editing?.expense?.groupId ?? ""
    : initialGroupId;
  if (expenseAPI.archivedGroups.some((summary) => summary.group?.id === requestedGroupId)) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-card p-6">
        <p className="text-ink-soft">{ARCHIVED_GROUP_HINT}</p>
        <Link href={`/groups/${requestedGroupId}`} className="font-semibold text-brand-600">
          {GROUP_ARCHIVE_ACTIONS.open}
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
