/** "Paid by" section: single-payer picker or per-person multi-payer amounts. */

import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { NewExpenseController } from "../../hooks/useNewExpense";

/**
 * Renders the "Paid by" section of the expense form: a toggle between a
 * single-payer person list and a per-person amount list for multiple payers,
 * plus the payer validation message when amounts don't add up.
 *
 * @param props - Component props.
 * @returns The payer editor section.
 */
export function PayerEditor({
  form,
}: {
  /** The expense-form controller from useNewExpense that owns all payer state. */
  form: NewExpenseController;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>PAID BY</Text>
        <View style={styles.multiToggle}>
          <Text style={styles.multiToggleLabel}>multiple people paid</Text>
          <Switch
            onValueChange={form.setMultiPayer}
            thumbColor={colors.card}
            trackColor={{ false: colors.line, true: colors.brand500 }}
            value={form.multiPayer}
          />
        </View>
      </View>

      <View style={styles.listCard}>
        {form.people.map((person, index) => (
          <View key={person.id} style={[styles.row, index > 0 ? styles.rowDivider : null]}>
            {form.multiPayer ? (
              <>
                <Avatar size="sm" user={person} />
                <Text numberOfLines={1} style={styles.rowName}>
                  {person.id === form.me?.id ? "You" : person.name}
                </Text>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={(text) =>
                    form.setPayerAmounts({ ...form.payerAmounts, [person.id]: text })
                  }
                  placeholder="0.00"
                  placeholderTextColor={colors.inkSoft}
                  style={styles.amountInput}
                  value={form.payerAmounts[person.id] ?? ""}
                />
              </>
            ) : (
              <Pressable
                onPress={() => form.setSinglePayerId(person.id)}
                style={styles.singleRow}
              >
                <Avatar size="sm" user={person} />
                <Text numberOfLines={1} style={styles.rowName}>
                  {person.id === form.me?.id ? "You" : person.name}
                </Text>
                {form.singlePayerId === person.id ? (
                  <Check color={colors.brand600} size={18} />
                ) : null}
              </Pressable>
            )}
          </View>
        ))}
      </View>

      {!form.payerCheck.ok ? (
        <Text style={styles.validation}>{form.payerCheck.message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  amountInput: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    textAlign: "right",
    width: 96,
  },
  listCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  multiToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  multiToggleLabel: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowName: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
  singleRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
  },
  validation: {
    color: colors.neg600,
    fontSize: 14,
    fontWeight: "500",
  },
});
