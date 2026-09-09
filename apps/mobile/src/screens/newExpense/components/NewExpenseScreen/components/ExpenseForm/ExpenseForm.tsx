/** New/edit expense form: receipt panel, context picker, basics (amount/date/category), payer + split editors, summary, submit. */

import { StyleSheet, View } from "react-native";
import { SplitSummary } from "@/components/expense/SplitSummary";
import { PeoplePicker } from "@/components/people/PeoplePicker";
import { useResponsiveLayout } from "@/components/shell/hooks/useResponsiveLayout";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DateField } from "@/components/ui/DateField";
import { TextField } from "@/components/ui/TextField";
import { useErrorToast } from "@/components/ui/ToastProvider";
import { centsToInput } from "@haalkhata/shared/money/money";
import { CATEGORIES } from "@haalkhata/shared/money/money.constants";
import { spacing } from "@/lib/theme/theme";
import type { ExpenseFormInitial } from "../../../../utils/initialValues";
import { previewSplitShares } from "../../../../utils/splitForm";
import { useNewExpense } from "../../hooks/useNewExpense";
import type { useNewExpenseAPI } from "../../hooks/useNewExpenseAPI";
import { PayerEditor } from "../PayerEditor/PayerEditor";
import { ReceiptPanel } from "../ReceiptPanel/ReceiptPanel";
import { SplitEditor } from "../SplitEditor/SplitEditor";
import { MAX_EXPENSE_DESCRIPTION_LENGTH, MAX_EXPENSE_NOTES_LENGTH } from "@haalkhata/shared/text/limits";

/**
 * Renders the full expense form: the receipt panel (a photo fills the form
 * in), the people picker (chips, a searchable friend list, the group), the basic fields (description,
 * amount, date, category), the payer and split editors, a who-owes-what
 * summary for whichever split is selected (a panel beside the form on wide
 * layouts, a strip that opens in place on phones), optional notes, and the
 * submit button. Save and scan errors surface through the screen's toast.
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
  const currency = form.selectedGroup?.currency ?? form.me?.defaultCurrency ?? "USD";
  const { isExpanded } = useResponsiveLayout();
  useErrorToast(form.error);

  // The same numbers in two places: a panel beside the form on wide layouts,
  // a strip under the Split section on phones.
  const summaryProps = {
    people: form.people,
    meId: form.me?.id,
    currency,
    shares: form.isItemized
      ? form.itemDraft.previewShares
      : previewSplitShares({
          splitType: form.splitType,
          totalCents: form.totalCents,
          participantIds: form.participantIds,
          inputs: form.splitInputs,
          currency,
        }),
    totalCents: form.totalCents ?? 0,
    breakdown: form.isItemized
      ? {
          itemsTotalCents: form.itemDraft.itemsTotalCents,
          taxCents: form.itemDraft.taxCents,
          tipCents: form.itemDraft.tipCents,
        }
      : undefined,
    warnings: form.isItemized
      ? form.itemDraft.warnings
      : !form.splitCheck.ok && form.totalCents !== null
        ? [form.splitCheck.message]
        : [],
    ready: form.isItemized ? (form.itemDraft.items?.length ?? 0) > 0 : (form.totalCents ?? 0) > 0,
    readyMessage: form.isItemized ? "Everything is assigned" : "Adds up to the total",
  };

  return (
    <View style={[styles.form, isExpanded ? styles.formExpanded : null]}>
      <View style={styles.formColumn}>
        {/* Editing cannot re-scan: re-parsing a photo over a saved expense
            would silently replace its lines. */}
        {form.isEdit ? null : <ReceiptPanel form={form} />}
        {isExpanded ? <SplitSummary layout="panel" {...summaryProps} /> : null}

        <PeoplePicker
          friendIds={form.friendIds}
          friends={form.friends.flatMap((friend) => (friend.user ? [friend.user] : []))}
          groupId={form.groupId}
          groups={form.groups.flatMap((summary) =>
            summary.group ? [{ id: summary.group.id, name: summary.group.name }] : [],
          )}
          me={form.me}
          onGroupChange={form.setGroupId}
          onToggleFriend={form.toggleFriend}
          people={form.people}
          scopeLocked={form.isEdit}
        />

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
                value={form.isItemized ? centsToInput(form.totalCents ?? 0, currency) : form.amount}
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
      </View>

      <View style={styles.formColumn}>
        <PayerEditor form={form} />
        <SplitEditor currency={currency} form={form} />
        {isExpanded ? null : <SplitSummary layout="strip" {...summaryProps} />}

        <TextField
          maxLength={MAX_EXPENSE_NOTES_LENGTH}
          multiline
          onChangeText={form.setNotes}
          placeholder="Notes (optional)"
          value={form.notes}
        />

        <Button
          busy={form.isSaving}
          disabled={!form.canSubmit}
          label={form.isEdit ? "Save changes" : "Add expense"}
          onPress={form.submit}
        />
      </View>
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
  form: {
    gap: spacing.xl,
  },
  formColumn: {
    flex: 1,
    gap: spacing.xl,
    minWidth: 0,
  },
  formExpanded: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.xxl,
  },
  section: {
    gap: spacing.md,
  },
});
