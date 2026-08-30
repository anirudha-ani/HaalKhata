/** Scanned-receipt draft editor: merchant/date, the shared item editor, and the payer picker. */

import { StyleSheet, Text, TextInput, View } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { DateField } from "@/components/ui/DateField";
import { ItemDraftEditor } from "@/components/expense/ItemDraftEditor";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { ScanController } from "../../hooks/useScan";

/**
 * Editable AI draft: correct the items, then tap people to assign them.
 * Renders the merchant/date fields, the shared item editor (rows, assignee
 * chips, assign-all shortcuts, tax/tip/total), and the payer picker.
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
          style={styles.merchantInput}
          value={scan.merchant}
        />
        <View style={styles.dateCell}>
          <DateField onChange={scan.setDate} value={scan.date} />
        </View>
      </View>

      <ItemDraftEditor currency={currency} draft={scan} meId={scan.me?.id} people={scan.people} />

      {/* Payer */}
      <View style={styles.payerSection}>
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
  badges: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
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
  merchantInput: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    paddingHorizontal: spacing.sm,
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
  payerSection: {
    gap: spacing.sm,
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
});
