/** Contact input: an Email | Phone toggle whose phone side is the country-aware PhoneField. */

import { StyleSheet, TextInput, View } from "react-native";
import type { ContactDraft, ContactMode } from "@haalkhata/shared/phone/contact";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { PhoneField } from "./PhoneField";
import { Segmented } from "./Segmented";

/** The two halves of the toggle, in the order they render. */
const CONTACT_MODES: { value: ContactMode; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

/**
 * Renders an email-or-phone contact field as an explicit choice instead of
 * one guessing box. The old single input routed by "contains an @", which
 * left phone numbers with no country picker and no validation; here the
 * phone side is the same searchable-country {@link PhoneField} the account
 * screen uses, so a number always arrives with its country and is checked
 * against that country's numbering plan before it can be submitted.
 *
 * @param props - Component props.
 * @returns The toggled contact field.
 */
export function EmailOrPhoneField({
  contact,
  onContactChange,
  emailPlaceholder = "you@example.com",
  emailLabel = "Email address",
  phoneLabel = "Phone number",
}: {
  /** Current draft: mode plus both sides' values. */
  contact: ContactDraft;
  /** Called with the whole updated draft on every change. */
  onContactChange: (contact: ContactDraft) => void;
  /** Placeholder for the email box. */
  emailPlaceholder?: string;
  /** Accessible label for the email box. */
  emailLabel?: string;
  /** Accessible label for the phone box. */
  phoneLabel?: string;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.toggleRow}>
        <Segmented
          onChange={(mode) => onContactChange({ ...contact, mode })}
          options={CONTACT_MODES}
          value={contact.mode}
        />
      </View>
      {contact.mode === "email" ? (
        <TextInput
          accessibilityLabel={emailLabel}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={(email) => onContactChange({ ...contact, email })}
          placeholder={emailPlaceholder}
          placeholderTextColor={colors.inkSoft}
          style={styles.emailInput}
          value={contact.email}
        />
      ) : (
        <PhoneField
          label={phoneLabel}
          nationalNumber={contact.nationalNumber}
          onNationalNumberChange={(nationalNumber) =>
            onContactChange({ ...contact, nationalNumber })
          }
          onRegionChange={(region) => onContactChange({ ...contact, region })}
          region={contact.region}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  emailInput: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleRow: {
    alignSelf: "flex-start",
  },
});
