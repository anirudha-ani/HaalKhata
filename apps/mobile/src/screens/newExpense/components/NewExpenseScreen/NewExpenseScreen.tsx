/** New/edit expense orchestrator: loads data, guards itemized edits, mounts ExpenseForm. */

import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { colors, radii, spacing } from "@/lib/theme/theme";
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

  if (expenseAPI.isLoading || !expenseAPI.me) {
    return (
      <Screen header={<DetailHeader title={isEdit ? "Edit expense" : "Add expense"} />}>
        <Spinner />
      </Screen>
    );
  }

  if (expenseAPI.editing?.expense?.splitType === "itemized") {
    return (
      <Screen header={<DetailHeader title="Itemized expense" />}>
        <View style={styles.guardCard}>
          <Text style={styles.guardTitle}>Itemized expense</Text>
          <Text style={styles.guardText}>
            Itemized (receipt) expenses can&apos;t be edited here yet — delete it and re-scan the
            receipt instead.
          </Text>
          <Button
            label="Back to expense"
            onPress={() => router.replace(`/expenses/${expenseAPI.editing?.expense?.id}`)}
          />
        </View>
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

const styles = StyleSheet.create({
  guardCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl,
  },
  guardText: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  guardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "600",
  },
});
