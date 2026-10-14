/** New/edit expense orchestrator: loads data, then mounts ExpenseForm with resolved initial values. */

import { ErrorState } from "@/components/ui/ErrorState";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { useRouter } from "expo-router";
import { Text } from "react-native";
import { Button } from "@/components/ui/Button";
import { colors } from "@/lib/theme/theme";
import { ARCHIVED_GROUP_HINT, GROUP_ARCHIVE_ACTIONS } from "@haalkhata/shared/group/archiving";
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
  const router = useRouter();
  const isEdit = editExpenseId !== "";

  if (expenseAPI.loadError) return <Screen header={<DetailHeader title={isEdit ? "Edit expense" : "Add expense"} />}><ErrorState error={expenseAPI.loadError} retry={expenseAPI.retry} /></Screen>;

  if (expenseAPI.isLoading || !expenseAPI.me) {
    return (
      <Screen header={<DetailHeader title={isEdit ? "Edit expense" : "Add expense"} />}>
        <Spinner />
      </Screen>
    );
  }

  const requestedGroupId = isEdit
    ? expenseAPI.editing?.expense?.groupId ?? ""
    : initialGroupId;
  if (expenseAPI.archivedGroups.some((summary) => summary.group?.id === requestedGroupId)) {
    return (
      <Screen header={<DetailHeader title={isEdit ? "Edit expense" : "Add expense"} />}>
        <Text style={{ color: colors.inkSoft }}>{ARCHIVED_GROUP_HINT}</Text>
        <Button
          label={GROUP_ARCHIVE_ACTIONS.open}
          onPress={() => router.push(`/groups/${requestedGroupId}`)}
        />
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
