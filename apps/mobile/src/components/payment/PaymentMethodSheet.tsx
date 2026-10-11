/** Bottom sheet for adding or editing one payment method: its name, currency, details, note and star. */

import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { CurrencyPicker } from "@/components/ui/CurrencyPicker";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import {
  METHOD_NAME_PLACEHOLDER,
  METHOD_NOTE_PLACEHOLDER,
} from "@haalkhata/shared/payment/copy";
import { METHOD_TEMPLATES } from "@haalkhata/shared/payment/templates";
import {
  MAX_PAYMENT_METHOD_NAME_LENGTH,
  MAX_PAYMENT_METHOD_NOTE_LENGTH,
} from "@haalkhata/shared/text/limits";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { DetailRow } from "./DetailRow";
import { usePaymentMethodForm } from "./hooks/usePaymentMethodForm";

/**
 * Renders the add-and-edit form for a payment method, top to bottom in the
 * order it is filled in: where to start from (adding only), the name, the
 * currency, the details a payer needs, a note, and the star.
 *
 * The Save button lives in the sheet's pinned footer, because the bank
 * starting point is taller than the screen. Failures stay inside the sheet:
 * a field's problem under that field, a refusal from the server above the
 * button that caused it.
 *
 * @param props - Component props.
 * @returns The sheet.
 */
export function PaymentMethodSheet({
  method,
  methods,
  defaultCurrency,
  forCurrency,
  onClose,
}: {
  /** The method being edited; omitted to add one. */
  method?: PaymentMethod;
  /** All of the owner's methods, to name the one a new star would displace. */
  methods: readonly PaymentMethod[];
  /** The owner's default currency, which a new method starts on. */
  defaultCurrency: string;
  /**
   * The currency a new method is wanted for, when the sheet was opened to
   * answer "how do you want to be paid in this currency?". The form then
   * opens on a starting point that works in it.
   */
  forCurrency?: string;
  /** Called when the sheet is dismissed, or the method is saved or removed. */
  onClose: () => void;
}) {
  const form = usePaymentMethodForm({
    method,
    methods,
    defaultCurrency,
    forCurrency,
    onDone: onClose,
  });
  const { draft, errors } = form;

  return (
    <Sheet
      footer={
        <View style={styles.footer}>
          {form.serverError ? <Text style={styles.error}>{form.serverError}</Text> : null}
          <Button
            busy={form.isSaving}
            disabled={form.isRemoving}
            label={method ? "Save changes" : "Add method"}
            onPress={form.save}
          />
        </View>
      }
      onClose={onClose}
      title={method ? "Edit payment method" : "Add payment method"}
    >
      <View style={styles.body}>
        {method ? null : (
          <View style={styles.block}>
            <Text style={styles.label}>Start from</Text>
            <View style={styles.chips}>
              {METHOD_TEMPLATES.map((template) => (
                <Chip
                  key={template.key}
                  label={template.label}
                  onPress={() => form.pickTemplate(template.key)}
                  selected={form.templateKey === template.key}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.block}>
          <TextField
            autoComplete="off"
            label="Name"
            maxLength={MAX_PAYMENT_METHOD_NAME_LENGTH}
            onChangeText={form.setName}
            placeholder={METHOD_NAME_PLACEHOLDER}
            value={draft.name}
          />
          {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Currency it works in</Text>
          {form.anyCurrency ? null : (
            <CurrencyPicker onChange={form.setCurrency} value={draft.currency} />
          )}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Works in any currency</Text>
            <Switch
              accessibilityLabel="Works in any currency"
              onValueChange={form.setAnyCurrency}
              thumbColor={colors.white}
              trackColor={{ false: colors.line, true: colors.brand600 }}
              value={form.anyCurrency}
            />
          </View>
          {errors.currency ? <Text style={styles.error}>{errors.currency}</Text> : null}
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Details</Text>
          <Text style={styles.hint}>
            Only what someone needs to send you money. Never a card number, PIN or password. Leave
            a row blank to skip it.
          </Text>
          <View style={styles.details}>
            {draft.details.map((detail, index) => (
              <DetailRow
                canRemove={form.canRemoveDetail}
                detail={detail}
                error={errors.detailRows[index] ?? ""}
                key={detail.rowId}
                kinds={form.kinds}
                onChange={(patch) => form.setDetail(detail.rowId, patch)}
                onKindChange={(kindKey) => form.setDetailKind(detail.rowId, kindKey)}
                onRemove={() => form.removeDetail(detail.rowId)}
                preset={draft.preset}
              />
            ))}
          </View>
          {errors.details ? <Text style={styles.error}>{errors.details}</Text> : null}
          {form.canAddDetail ? (
            <Pressable accessibilityRole="button" onPress={form.addDetail} style={styles.addDetail}>
              <Plus color={colors.inkSoft} size={16} />
              <Text style={styles.addDetailText}>Add another detail</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.block}>
          <TextField
            autoComplete="off"
            label="Note to the payer (optional)"
            maxLength={MAX_PAYMENT_METHOD_NOTE_LENGTH}
            onChangeText={form.setNote}
            placeholder={METHOD_NOTE_PLACEHOLDER}
            value={draft.note}
          />
          {errors.note ? <Text style={styles.error}>{errors.note}</Text> : null}
        </View>

        <View style={styles.block}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabelStrong}>
                Make this my preferred method for {form.currencyName}
              </Text>
              <Text style={styles.hint}>
                It is shown first, and selected, when someone settles up with you.
              </Text>
            </View>
            <Switch
              accessibilityLabel={`Make this my preferred method for ${form.currencyName}`}
              onValueChange={form.setPreferred}
              thumbColor={colors.white}
              trackColor={{ false: colors.line, true: colors.brand600 }}
              value={draft.preferred}
            />
          </View>
          {form.displacedName ? (
            <Text style={styles.displaced}>
              This replaces {form.displacedName} as your preferred method for {form.currencyName}.
            </Text>
          ) : null}
        </View>

        {method ? (
          form.confirmingRemove ? (
            // In place rather than in an alert: the answer sits where the tap
            // happened, and backing out leaves the form untouched.
            <View style={styles.removeConfirm}>
              <Text style={styles.removeQuestion}>
                Remove {method.name}? People who owe you will stop seeing it.
              </Text>
              <View style={styles.removeActions}>
                <View style={styles.removeAction}>
                  <Button busy={form.isRemoving} label="Remove" onPress={form.removeMethod} />
                </View>
                <View style={styles.removeAction}>
                  <Button
                    disabled={form.isRemoving}
                    label="Keep it"
                    onPress={form.cancelRemove}
                    variant="outline"
                  />
                </View>
              </View>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={form.askRemove} style={styles.removeLink}>
              <Text style={styles.removeLinkText}>Remove this method</Text>
            </Pressable>
          )
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  addDetail: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs + 2,
    minHeight: 44,
  },
  addDetailText: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: "600",
  },
  block: {
    gap: spacing.sm,
  },
  body: {
    gap: spacing.lg,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  details: {
    gap: spacing.md,
  },
  displaced: {
    color: colors.neg700,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "500",
  },
  footer: {
    gap: spacing.sm,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
  },
  removeAction: {
    flex: 1,
  },
  removeActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  removeConfirm: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  removeLink: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  removeLinkText: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  removeQuestion: {
    color: colors.brand700,
    fontSize: 14,
    fontWeight: "500",
  },
  switchLabel: {
    color: colors.inkSoft,
    flex: 1,
    fontSize: 14,
  },
  switchLabelStrong: {
    color: colors.ink,
    fontSize: 14,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    minHeight: 44,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
});
