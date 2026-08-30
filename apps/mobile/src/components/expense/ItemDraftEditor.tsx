/** Itemized draft editor: item rows with assignee chips, assign-all shortcuts, and the tax/tip/total card. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Plus, Trash2 } from "lucide-react-native";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { formatMoney } from "@haalkhata/shared/money/money";
import { MAX_EXPENSE_ITEM_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import type { ItemDraft } from "@/lib/hooks/useItemDraft";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the editable lines of an itemized expense — the same editor
 * whether the lines came from a scanned receipt or are being typed or
 * corrected by hand: correct each row, tap people to assign it, assign
 * everything to one person, and see the tax/tip/total add up.
 *
 * @param props - Component props.
 * @returns The item editor, or null while the draft has no lines yet.
 */
export function ItemDraftEditor({
  draft,
  people,
  meId,
  currency,
}: {
  /** The draft controller from useItemDraft. */
  draft: ItemDraft;
  /** Everyone a line can be assigned to, the viewer first. */
  people: User[];
  /** The signed-in user's id, so their chip reads "You". */
  meId: string | undefined;
  /** ISO 4217 code the totals are shown in. */
  currency: string;
}) {
  if (draft.items === null) return null;

  /**
   * Chip caption for a person: "You" for the viewer, first name otherwise.
   *
   * @param person - The person to caption.
   * @returns The short label.
   */
  const shortName = (person: User) => (person.id === meId ? "You" : person.name.split(" ")[0]);

  return (
    <View style={styles.container}>
      <View style={styles.itemsCard}>
        <View style={styles.itemsCardHeader}>
          <Text style={styles.itemsCardTitle}>TAP PEOPLE TO ASSIGN EACH ITEM</Text>
        </View>
        {draft.items.map((item, index) => {
          const assigned = Object.values(item.assignees).some(Boolean);
          return (
            <View
              key={item.key}
              style={[
                styles.itemBlock,
                index > 0 ? styles.itemDivider : null,
                assigned ? null : styles.itemUnassigned,
              ]}
            >
              <View style={styles.itemRow}>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(text) =>
                    draft.updateItem(index, { quantity: Math.max(1, Number(text) || 1) })
                  }
                  style={[styles.cell, styles.quantityInput]}
                  value={String(item.quantity)}
                />
                <TextInput
                  maxLength={MAX_EXPENSE_ITEM_NAME_LENGTH}
                  onChangeText={(text) => draft.updateItem(index, { name: text })}
                  placeholder="Item"
                  placeholderTextColor={colors.inkSoft}
                  style={[styles.cell, styles.nameInput]}
                  value={item.name}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={(text) => draft.updateItem(index, { total: text })}
                  placeholder="0.00"
                  placeholderTextColor={colors.inkSoft}
                  style={[styles.cell, styles.totalInput]}
                  value={item.total}
                />
                <Pressable
                  accessibilityLabel="Remove item"
                  hitSlop={6}
                  onPress={() => draft.removeItem(index)}
                  style={styles.removeButton}
                >
                  <Trash2 color={colors.inkSoft} size={16} />
                </Pressable>
              </View>
              <View style={styles.assigneeRow}>
                {people.map((person) => {
                  const isAssigned = item.assignees[person.id] ?? false;
                  return (
                    <Pressable
                      key={person.id}
                      onPress={() => draft.toggleAssignee(index, person.id)}
                      style={[styles.assigneeChip, isAssigned ? styles.assigneeChipSelected : null]}
                    >
                      <Avatar size="sm" user={person} />
                      <Text
                        style={[styles.assigneeName, isAssigned ? styles.assigneeNameSelected : null]}
                      >
                        {shortName(person)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
        <Pressable onPress={draft.addItem} style={styles.addItemButton}>
          <Plus color={colors.brand600} size={16} />
          <Text style={styles.addItemText}>Add item</Text>
        </Pressable>
      </View>

      {draft.items.length > 0 ? (
        <View style={styles.quickAssign}>
          <Text style={styles.sectionLabel}>ASSIGN EVERYTHING TO</Text>
          <View style={styles.chipRow}>
            {people.map((person) => (
              <Chip
                key={person.id}
                label={shortName(person)}
                onPress={() => draft.assignAllTo(person.id)}
                selected={false}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.totalsCard}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Items</Text>
          <Text style={styles.totalsValue}>{formatMoney(draft.itemsTotalCents, currency)}</Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Tax</Text>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={draft.setTax}
            style={[styles.cell, styles.totalsInput]}
            value={draft.tax}
          />
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Tip</Text>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={draft.setTip}
            style={[styles.cell, styles.totalsInput]}
            value={draft.tip}
          />
        </View>
        <View style={[styles.totalsRow, styles.grandTotalRow]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>{formatMoney(draft.grandTotalCents, currency)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  addItemButton: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  addItemText: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "600",
  },
  assigneeChip: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    opacity: 0.65,
    paddingLeft: 2,
    paddingRight: spacing.md,
    paddingVertical: 2,
  },
  assigneeChipSelected: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand600,
    opacity: 1,
  },
  assigneeName: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "500",
  },
  assigneeNameSelected: {
    color: colors.brand700,
  },
  assigneeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  cell: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  container: {
    gap: spacing.lg,
  },
  grandTotalLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  grandTotalRow: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  grandTotalValue: {
    color: colors.ink,
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  itemBlock: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  itemDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  itemRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  itemsCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemsCardHeader: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  itemsCardTitle: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
  itemUnassigned: {
    backgroundColor: colors.neg50,
  },
  nameInput: {
    flex: 1,
  },
  quantityInput: {
    textAlign: "center",
    width: 48,
  },
  quickAssign: {
    gap: spacing.sm,
  },
  removeButton: {
    padding: spacing.xs,
  },
  sectionLabel: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
  totalInput: {
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    width: 76,
  },
  totalsCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  totalsInput: {
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    width: 96,
  },
  totalsLabel: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  totalsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalsValue: {
    color: colors.ink,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
  },
});
