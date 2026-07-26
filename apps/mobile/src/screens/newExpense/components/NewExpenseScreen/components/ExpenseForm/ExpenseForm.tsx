/** New/edit expense form: context picker, basics (amount/date/category), payer + split editors, submit. */

import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DateField } from "@/components/ui/DateField";
import { TextField } from "@/components/ui/TextField";
import { CATEGORIES } from "@haalkhata/shared/money/money.constants";
import { colors, spacing } from "@/lib/theme/theme";
import type { ExpenseFormInitial } from "../../../../utils/initialValues";
import { useNewExpense } from "../../hooks/useNewExpense";
import type { useNewExpenseAPI } from "../../hooks/useNewExpenseAPI";
import { PayerEditor } from "../PayerEditor/PayerEditor";
import { SplitEditor } from "../SplitEditor/SplitEditor";

/**
 * Renders the full expense form: the group/friend context picker, the basic
 * fields (description, amount, date, category), the payer and split editors,
 * optional notes, validation errors, and the submit button.
 *
 * @param props - Component props.
 * @returns The expense form for creating or editing an expense.
 */
export function ExpenseForm({
  api: expenseAPI,
  initial,
  editExpenseId,
}: {
  /** Query/mutation bundle from useNewExpenseAPI, owned by the screen orchestrator. */
  api: ReturnType<typeof useNewExpenseAPI>;
  /** Fully-resolved initial field values (create defaults or the expense being edited). */
  initial: ExpenseFormInitial;
  /** Id of the expense being edited, or "" when creating a new one. */
  editExpenseId: string;
}) {
  const form = useNewExpense(expenseAPI, initial, editExpenseId);
  const router = useRouter();
  const currency = form.selectedGroup?.currency ?? form.me?.defaultCurrency ?? "USD";

  return (
    <View style={styles.form}>
      {/* Context picker */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WHO IS THIS WITH?</Text>
        {form.groups.length > 0 ? (
          <View style={styles.contextGroup}>
            <Text style={styles.contextLabel}>Groups</Text>
            <View style={styles.chips}>
              {form.groups.map((summary) =>
                summary.group ? (
                  <Chip
                    key={summary.group.id}
                    label={summary.group.name}
                    onPress={() =>
                      form.isEdit ? undefined : form.setContext(`g:${summary.group?.id}`)
                    }
                    selected={form.context === `g:${summary.group.id}`}
                  />
                ) : null,
              )}
            </View>
          </View>
        ) : null}
        {form.friends.length > 0 ? (
          <View style={styles.contextGroup}>
            <Text style={styles.contextLabel}>Friends (one-off)</Text>
            <View style={styles.chips}>
              {form.friends.map((friend) =>
                friend.user ? (
                  <Chip
                    key={friend.user.id}
                    label={friend.user.name}
                    onPress={() =>
                      form.isEdit ? undefined : form.setContext(`f:${friend.user?.id}`)
                    }
                    selected={form.context === `f:${friend.user.id}`}
                  />
                ) : null,
              )}
            </View>
          </View>
        ) : null}
        {form.groups.length === 0 && form.friends.length === 0 ? (
          <View>
            <Text style={styles.needContext}>
              You need a group or a friend first.
            </Text>
            <View style={styles.needContextActions}>
              <Button
                compact
                label="Groups"
                onPress={() => router.push("/groups")}
                variant="outline"
              />
              <Button
                compact
                label="Friends"
                onPress={() => router.push("/friends")}
                variant="outline"
              />
            </View>
          </View>
        ) : null}
      </View>

      {/* Basics */}
      <View style={styles.section}>
        <TextField
          onChangeText={form.setDescription}
          placeholder="What was it for?"
          value={form.description}
        />
        <View style={styles.basicsRow}>
          <View style={styles.basicsCell}>
            <TextField
              keyboardType="decimal-pad"
              label={`Amount (${currency})`}
              onChangeText={form.setAmount}
              placeholder="0.00"
              value={form.amount}
            />
          </View>
          <View style={styles.basicsCell}>
            <DateField label="Date" onChange={form.setDate} value={form.date} />
          </View>
        </View>
        <View style={styles.chips}>
          {CATEGORIES.map((categoryOption) => (
            <Chip
              key={categoryOption}
              label={categoryOption}
              onPress={() => form.setCategory(categoryOption)}
              selected={form.category === categoryOption}
            />
          ))}
        </View>
      </View>

      <PayerEditor form={form} />
      <SplitEditor form={form} />

      <TextField
        multiline
        onChangeText={form.setNotes}
        placeholder="Notes (optional)"
        value={form.notes}
      />

      {form.error ? <Text style={styles.error}>{form.error}</Text> : null}

      <Button
        busy={form.isSaving}
        disabled={!form.canSubmit}
        label={form.isEdit ? "Save changes" : "Add expense"}
        onPress={form.submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  basicsCell: {
    flex: 1,
  },
  basicsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  contextGroup: {
    gap: spacing.sm,
  },
  contextLabel: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "500",
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "500",
  },
  form: {
    gap: spacing.xl,
  },
  needContext: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  needContextActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
});
