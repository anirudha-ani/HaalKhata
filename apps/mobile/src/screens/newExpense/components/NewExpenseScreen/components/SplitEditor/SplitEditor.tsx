/** Split section: split-type tabs plus per-person participation and value inputs. */

import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Segmented } from "@/components/ui/Segmented";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { SPLIT_TABS, UNIT } from "../../../../constants/splitEditor";
import type { NewExpenseController } from "../../hooks/useNewExpense";

/**
 * Renders the "Split" section of the expense form: split-type tabs, a
 * per-person list with participation checkboxes and (for non-equal splits)
 * value inputs, plus either the split validation message or the equal-split
 * per-person summary.
 *
 * @param props - Component props.
 * @returns The split editor section.
 */
export function SplitEditor({
  form,
}: {
  /** The expense-form controller from useNewExpense that owns all split state. */
  form: NewExpenseController;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>SPLIT</Text>

      <Segmented onChange={form.setSplitType} options={SPLIT_TABS} value={form.splitType} />

      <View style={styles.listCard}>
        {form.people.map((person, index) => {
          const isChecked = form.checked[person.id] ?? false;
          return (
            <View key={person.id} style={[styles.row, index > 0 ? styles.rowDivider : null]}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isChecked }}
                onPress={() => form.setChecked({ ...form.checked, [person.id]: !isChecked })}
                style={styles.personToggle}
              >
                <View style={[styles.checkbox, isChecked ? styles.checkboxChecked : null]}>
                  {isChecked ? <Check color={colors.white} size={12} /> : null}
                </View>
                <Avatar size="sm" user={person} />
                <Text numberOfLines={1} style={styles.rowName}>
                  {person.id === form.me?.id ? "You" : person.name}
                </Text>
              </Pressable>
              {form.splitType !== "equal" && isChecked ? (
                <View style={styles.valueCell}>
                  <TextInput
                    keyboardType="decimal-pad"
                    onChangeText={(text) =>
                      form.setSplitInputs({ ...form.splitInputs, [person.id]: text })
                    }
                    placeholder="0"
                    placeholderTextColor={colors.inkSoft}
                    style={styles.valueInput}
                    value={form.splitInputs[person.id] ?? ""}
                  />
                  {UNIT[form.splitType] ? (
                    <Text style={styles.unit}>{UNIT[form.splitType]}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {!form.splitCheck.ok && form.totalCents !== null ? (
        <Text style={styles.validation}>{form.splitCheck.message}</Text>
      ) : form.splitType === "equal" && form.participantIds.length > 0 && form.totalCents ? (
        <Text style={styles.summary}>
          {(form.totalCents / 100 / form.participantIds.length).toFixed(2)} each ·{" "}
          {form.participantIds.length} people
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 5,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  checkboxChecked: {
    backgroundColor: colors.brand600,
    borderColor: colors.brand600,
  },
  listCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  personToggle: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
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
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "500",
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
  summary: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  unit: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  validation: {
    color: colors.neg600,
    fontSize: 14,
    fontWeight: "500",
  },
  valueCell: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  valueInput: {
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
    width: 80,
  },
});
