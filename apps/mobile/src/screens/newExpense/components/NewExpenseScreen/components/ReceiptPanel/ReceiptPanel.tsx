/** Receipt input for the expense form: camera/library pickers, parse action, and the photo to check against. */

import { Camera, Images, ScanLine } from "lucide-react-native";
import { Image, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { NewExpenseController } from "../../hooks/useNewExpense";

/**
 * Renders the receipt half of the expense form: the pickers, the "Itemize
 * with AI" action, and — once picked — the photo the numbers are read from.
 *
 * This is an input to the expense form, not a separate flow. Scanning does
 * not produce a different kind of expense: it fills in the description, date,
 * tax, tip and line items of the very same form, which is why there is no
 * longer a scan screen holding a second copy of the item editor and the
 * payer picker.
 *
 * @param props - Component props.
 * @returns The receipt panel.
 */
export function ReceiptPanel({
  form,
}: {
  /** The expense-form controller from useNewExpense that owns the receipt state. */
  form: NewExpenseController;
}) {
  return (
    <View style={styles.container}>
      <View style={[styles.captureZone, form.photo ? styles.captureZoneFilled : null]}>
        {form.photo ? (
          <Image
            accessibilityLabel="Receipt preview"
            resizeMode="contain"
            source={{ uri: form.photo.uri }}
            style={styles.preview}
          />
        ) : (
          <>
            <ScanLine color={colors.brand600} size={28} />
            <Text style={styles.captureTitle}>Scan a receipt</Text>
            <Text style={styles.captureHint}>Items, tax and tip fill themselves in</Text>
          </>
        )}
        {/* Two pickers, not one: the camera alone gives no way to reach an
            existing photo, which breaks the common case of shooting the
            receipt at the table and splitting it later. */}
        {form.fromReceipt ? null : (
          <View style={styles.captureActions}>
            <View style={styles.captureAction}>
              <Button
                compact
                icon={<Camera color={colors.white} size={16} />}
                label={form.photo ? "Retake" : "Take photo"}
                onPress={() => void form.pickPhoto(true)}
              />
            </View>
            <View style={styles.captureAction}>
              <Button
                compact
                icon={<Images color={colors.inkSoft} size={16} />}
                label={form.photo ? "Different photo" : "Choose photo"}
                onPress={() => void form.pickPhoto(false)}
                variant="outline"
              />
            </View>
          </View>
        )}
      </View>

      {form.photo && !form.fromReceipt && !form.isParsing ? (
        <Button
          icon={<ScanLine color={colors.white} size={18} />}
          label="Itemize with AI"
          onPress={form.parseNow}
        />
      ) : null}

      {form.isParsing ? <Spinner label="Extracting items, tax and tip…" /> : null}

      {form.fromReceipt ? (
        <View style={styles.badges}>
          <View style={styles.parsedBadge}>
            <Text style={styles.parsedBadgeText}>
              ✓ auto-itemized{form.provider ? ` · ${form.provider}` : ""}
            </Text>
          </View>
          {form.provider === "mock" ? (
            <View style={styles.mockBadge}>
              <Text style={styles.mockBadgeText}>demo data — no AI provider configured</Text>
            </View>
          ) : null}
          <Text style={styles.reviewHint}>check the items below before saving</Text>
        </View>
      ) : null}
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
  captureAction: {
    flex: 1,
  },
  captureActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    width: "100%",
  },
  captureHint: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  captureTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  captureZone: {
    alignItems: "center",
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
    borderRadius: radii.lg,
    borderStyle: "dashed",
    borderWidth: 2,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  captureZoneFilled: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderStyle: "solid",
    borderWidth: 1,
    padding: spacing.md,
  },
  container: {
    gap: spacing.md,
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
  preview: {
    borderRadius: radii.md,
    height: 220,
    width: "100%",
  },
  reviewHint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
});
