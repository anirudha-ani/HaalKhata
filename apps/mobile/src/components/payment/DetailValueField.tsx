/** The value control of one payment detail: a phone field, a choice, or a text input with the right keyboard. */

import { StyleSheet, Text, TextInput, View } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";
import {
  ACCOUNT_TYPES,
  CUSTOM_DETAIL_KIND,
  detailKindName,
  findDetailKind,
} from "@haalkhata/shared/payment/detailKinds";
import { CUSTOM_LABEL_PLACEHOLDER } from "@haalkhata/shared/payment/copy";
import { findPaymentMethod } from "@haalkhata/shared/payment/methods";
import type { DetailDraft } from "@haalkhata/shared/payment/methodDraft";
import { MAX_PAYMENT_DETAIL_LABEL_LENGTH } from "@haalkhata/shared/text/limits";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { DETAIL_KEYBOARDS } from "./payment.constants";

/**
 * Renders the control a detail's value is typed into.
 *
 * Identifiers are typed exactly: no auto-capitalisation and no autocorrect.
 * A keyboard that "fixes" an IBAN or a username produces a wrong one, and
 * nothing on screen would say so.
 *
 * @param props - Component props.
 * @returns The value control for the row's kind.
 */
export function DetailValueField({
  detail,
  preset,
  onChange,
}: {
  /** The row being edited. */
  detail: DetailDraft;
  /** The method's preset key, whose fixed prefix is drawn in front of a username. */
  preset: string;
  /** Called with the typed fields that changed. */
  onChange: (patch: Partial<DetailDraft>) => void;
}) {
  const kind = findDetailKind(detail.kind);
  // A custom detail is named by its own label once it has one.
  const label =
    (detail.kind === CUSTOM_DETAIL_KIND && detail.label.trim()) || detailKindName(detail.kind);

  if (kind?.input === "phone") {
    return (
      <PhoneField
        label={label}
        nationalNumber={detail.nationalNumber}
        onNationalNumberChange={(nationalNumber) => onChange({ nationalNumber })}
        onRegionChange={(region) => onChange({ region })}
        region={detail.region}
      />
    );
  }

  if (kind?.input === "choice") {
    return (
      <View style={styles.choices}>
        {ACCOUNT_TYPES.map((accountType) => (
          <Chip
            key={accountType.key}
            label={accountType.label}
            // Tapping the selected one clears it, which is how the row is left blank.
            onPress={() =>
              onChange({ value: detail.value === accountType.key ? "" : accountType.key })
            }
            selected={detail.value === accountType.key}
          />
        ))}
      </View>
    );
  }

  const builtIn = detail.kind === "username" ? findPaymentMethod(preset) : undefined;
  // A built-in app's sigil is furniture, not something to type: drawn inside
  // the border so the group still reads as one field.
  const prefix = builtIn?.handlePrefix ?? "";
  const valueInput = (
    <View style={styles.inputGroup}>
      {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={kind?.capitals ?? "none"}
        autoComplete="off"
        autoCorrect={false}
        keyboardType={
          kind && kind.input in DETAIL_KEYBOARDS
            ? DETAIL_KEYBOARDS[kind.input as keyof typeof DETAIL_KEYBOARDS]
            : "default"
        }
        maxLength={kind?.maxLength}
        onChangeText={(value) => onChange({ value })}
        placeholder={prefix ? builtIn?.handleExample : kind?.example}
        placeholderTextColor={colors.inkSoft}
        spellCheck={false}
        style={[styles.input, prefix ? null : styles.inputBare]}
        value={detail.value}
      />
    </View>
  );

  if (detail.kind !== CUSTOM_DETAIL_KIND) return valueInput;
  return (
    <View style={styles.custom}>
      <TextField
        accessibilityLabel="Label for this detail"
        autoCorrect={false}
        maxLength={MAX_PAYMENT_DETAIL_LABEL_LENGTH}
        onChangeText={(labelText) => onChange({ label: labelText })}
        placeholder={CUSTOM_LABEL_PLACEHOLDER}
        value={detail.label}
      />
      {valueInput}
    </View>
  );
}

const styles = StyleSheet.create({
  choices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  custom: {
    gap: spacing.sm,
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    minWidth: 0,
    paddingRight: 14,
    paddingVertical: 12,
  },
  inputBare: {
    paddingLeft: 14,
  },
  inputGroup: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
  },
  prefix: {
    color: colors.inkSoft,
    fontSize: 15,
    paddingLeft: 14,
    paddingRight: 2,
  },
});
