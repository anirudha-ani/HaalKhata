/** New/edit expense form: receipt panel, context picker, basics (amount/date/category), payer + split editors, submit. */

import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DateField } from "@/components/ui/DateField";
import { TextField } from "@/components/ui/TextField";
import { centsToInput } from "@haalkhata/shared/money/money";
import { CATEGORIES } from "@haalkhata/shared/money/money.constants";
import { colors, spacing } from "@/lib/theme/theme";
import type { ExpenseFormInitial } from "../../../../utils/initialValues";
import { useNewExpense } from "../../hooks/useNewExpense";
import type { useNewExpenseAPI } from "../../hooks/useNewExpenseAPI";
import { PayerEditor } from "../PayerEditor/PayerEditor";
import { ReceiptPanel } from "../ReceiptPanel/ReceiptPanel";
import { SplitEditor } from "../SplitEditor/SplitEditor";
import { MAX_EXPENSE_DESCRIPTION_LENGTH, MAX_EXPENSE_NOTES_LENGTH } from "@haalkhata/shared/text/limits";

/**
 * Renders the full expense form: the receipt panel (a photo fills the form
 * in), the group/friend context picker, the basic fields (description,
 * amount, date, category), the payer and split editors, optional notes,
 * validation errors, and the submit button.
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
      {/* Editing cannot re-scan: re-parsing a photo over a saved expense
          would silently replace its lines. */}
      {form.isEdit ? null : <ReceiptPanel form={form} />}

      {/* Who's on this: any number of friends, or one group instead. While
          editing, only the group choice is locked — the server pins a saved
          expense to its scope because settlements live there — so the group
          chips dim; people can still be added or removed. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WHO&apos;S ON THIS?</Text>
        {form.friends.length > 0 ? (
          <View style={styles.contextGroup}>
            <Text style={styles.contextLabel}>Tap everyone sharing this</Text>
            <View style={styles.chips}>
              {form.friends.map((friend) =>
                friend.user ? (
                  <Chip
                    key={friend.user.id}
                    label={friend.user.name}
                    onPress={() => form.toggleFriend(friend.user?.id ?? "")}
                    selected={form.friendIds.includes(friend.user.id)}
                  />
                ) : null,
              )}
            </View>
          </View>
        ) : null}
        {form.groups.length > 0 ? (
          <View style={styles.contextGroup}>
            <Text style={styles.contextLabel}>
              {form.isEdit
                ? "…or a group — can't change once saved"
                : "…or a group — its members become the cast"}
            </Text>
            <View style={styles.chips}>
              {form.groups.map((summary) =>
                summary.group ? (
                  <Chip
                    disabled={form.isEdit}
                    key={summary.group.id}
                    label={summary.group.name}
                    // Re-tapping the selected group clears it, which is the
                    // only way back to a one-off with no extra control.
                    onPress={() =>
                      form.setGroupId(
                        form.groupId === summary.group?.id ? "" : (summary.group?.id ?? ""),
                      )
                    }
                    selected={form.groupId === summary.group.id}
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
          maxLength={MAX_EXPENSE_DESCRIPTION_LENGTH}
          onChangeText={form.setDescription}
          placeholder="What was it for?"
          value={form.description}
        />
        <View style={styles.basicsRow}>
          <View style={styles.basicsCell}>
            {/* Itemized totals are derived from the line items, so the field
                becomes a read-only readout of items + tax + tip. */}
            <TextField
              editable={!form.isItemized}
              keyboardType="decimal-pad"
              label={form.isItemized ? `Total (${currency}) · from items` : `Amount (${currency})`}
              onChangeText={form.setAmount}
              placeholder="0.00"
              value={form.isItemized ? centsToInput(form.totalCents ?? 0) : form.amount}
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
      <SplitEditor currency={currency} form={form} />

      <TextField
        maxLength={MAX_EXPENSE_NOTES_LENGTH}
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
