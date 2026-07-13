/** Scanned-receipt draft editor: item rows, assignee chips, tax/tip totals, payer picker. */

import { Plus, Trash2 } from "lucide-react-native";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { DateField } from "@/components/ui/DateField";
import { formatMoney } from "@/lib/money/money";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { ScanController } from "../../hooks/useScan";

/**
 * Editable AI draft: correct items, then tap people to assign them. Renders
 * the merchant/date fields, the item rows with per-person assignee chips,
 * quick assign-all shortcuts, the tax/tip/total summary, and the payer picker.
 *
 * @returns The draft editing form, or null until a receipt has been parsed.
 */
export function DraftEditor({
  scan,
}: {
  /** The scan flow controller returned by useScan, owned by ScanScreen. */
  scan: ScanController;
}) {
  if (scan.items === null) return null;
  const currency = scan.selectedGroup?.currency ?? scan.me?.defaultCurrency ?? "USD";

  return (
    <View style={styles.container}>
      <View style={styles.badges}>
        <View style={styles.parsedBadge}>
          <Text style={styles.parsedBadgeText}>
            ✓ auto-itemized{scan.provider ? ` · ${scan.provider}` : ""}
          </Text>
        </View>
        {scan.provider === "mock" ? (
          <View style={styles.mockBadge}>
            <Text style={styles.mockBadgeText}>demo data — no AI provider configured</Text>
          </View>
        ) : null}
        <Text style={styles.reviewHint}>review &amp; correct before saving</Text>
      </View>

      <View style={styles.merchantRow}>
        <TextInput
          onChangeText={scan.setMerchant}
          placeholder="Merchant"
          placeholderTextColor={colors.inkSoft}
          style={[styles.cell, styles.merchantInput]}
          value={scan.merchant}
        />
        <View style={styles.dateCell}>
          <DateField onChange={scan.setDate} value={scan.date} />
        </View>
      </View>

      {/* Items */}
      <View style={styles.itemsCard}>
        <View style={styles.itemsCardHeader}>
          <Text style={styles.itemsCardTitle}>TAP PEOPLE TO ASSIGN EACH ITEM</Text>
        </View>
        {scan.items.map((item, index) => {
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
                    scan.updateItem(index, { quantity: Math.max(1, Number(text) || 1) })
                  }
                  style={[styles.cell, styles.quantityInput]}
                  value={String(item.quantity)}
                />
                <TextInput
                  onChangeText={(text) => scan.updateItem(index, { name: text })}
                  placeholder="Item"
                  placeholderTextColor={colors.inkSoft}
                  style={[styles.cell, styles.nameInput]}
                  value={item.name}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={(text) => scan.updateItem(index, { total: text })}
                  placeholder="0.00"
                  placeholderTextColor={colors.inkSoft}
                  style={[styles.cell, styles.totalInput]}
                  value={item.total}
                />
                <Pressable
                  accessibilityLabel="Remove item"
                  hitSlop={6}
                  onPress={() => scan.removeItem(index)}
                  style={styles.removeButton}
                >
                  <Trash2 color={colors.inkSoft} size={16} />
                </Pressable>
              </View>
              <View style={styles.assigneeRow}>
                {scan.people.map((person) => {
                  const isAssigned = item.assignees[person.id] ?? false;
                  return (
                    <Pressable
                      key={person.id}
                      onPress={() => scan.toggleAssignee(index, person.id)}
                      style={[
                        styles.assigneeChip,
                        isAssigned ? styles.assigneeChipSelected : null,
                      ]}
                    >
                      <Avatar size="sm" user={person} />
                      <Text
                        style={[
                          styles.assigneeName,
                          isAssigned ? styles.assigneeNameSelected : null,
                        ]}
                      >
                        {person.id === scan.me?.id ? "You" : person.name.split(" ")[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
        <Pressable onPress={scan.addItem} style={styles.addItemButton}>
          <Plus color={colors.brand600} size={16} />
          <Text style={styles.addItemText}>Add item</Text>
        </Pressable>
      </View>

      {/* Quick assign-all */}
      <View style={styles.quickAssign}>
        <Text style={styles.sectionLabel}>ASSIGN EVERYTHING TO</Text>
        <View style={styles.chipRow}>
          {scan.people.map((person) => (
            <Chip
              key={person.id}
              label={person.id === scan.me?.id ? "You" : person.name.split(" ")[0]}
              onPress={() => scan.assignAllTo(person.id)}
              selected={false}
            />
          ))}
        </View>
      </View>

      {/* Tax, tip, totals */}
      <View style={styles.totalsCard}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Items</Text>
          <Text style={styles.totalsValue}>{formatMoney(scan.itemsTotalCents, currency)}</Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Tax</Text>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={scan.setTax}
            style={[styles.cell, styles.totalsInput]}
            value={scan.tax}
          />
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Tip</Text>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={scan.setTip}
            style={[styles.cell, styles.totalsInput]}
            value={scan.tip}
          />
        </View>
        <View style={[styles.totalsRow, styles.grandTotalRow]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>
            {formatMoney(scan.grandTotalCents, currency)}
          </Text>
        </View>
      </View>

      {/* Payer */}
      <View style={styles.quickAssign}>
        <Text style={styles.sectionLabel}>PAID BY</Text>
        <View style={styles.chipRow}>
          {scan.people.map((person) => (
            <Chip
              key={person.id}
              label={person.id === scan.me?.id ? "You" : person.name.split(" ")[0]}
              onPress={() => scan.setPayerId(person.id)}
              selected={scan.payerId === person.id}
            />
          ))}
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
    paddingRight: spacing.md,
    paddingVertical: 2,
    paddingLeft: 2,
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
  badges: {
    alignItems: "center",
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
  dateCell: {
    flex: 1,
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
  merchantInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    paddingVertical: 11,
  },
  merchantRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  mockBadge: {
    backgroundColor: colors.neg50,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  mockBadgeText: {
    color: colors.neg700,
    fontSize: 12,
    fontWeight: "600",
  },
  nameInput: {
    flex: 1,
  },
  parsedBadge: {
    backgroundColor: colors.pos50,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  parsedBadgeText: {
    color: colors.pos700,
    fontSize: 12,
    fontWeight: "600",
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
  reviewHint: {
    color: colors.inkSoft,
    fontSize: 12,
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
