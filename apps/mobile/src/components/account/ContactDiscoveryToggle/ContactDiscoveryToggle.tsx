/** The "let people find me from their contacts" switch, with what it means beside it. */

import { StyleSheet, Switch, View } from "react-native";
import { CONTACT_DISCOVERY_SETTING } from "@haalkhata/shared/contacts/contactsCopy";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * Renders the discoverability switch. It only reports changes; saving is the
 * caller's (immediately under Account, on Continue during onboarding).
 *
 * @param props - Component props.
 * @returns The labelled switch and its explanation.
 */
export function ContactDiscoveryToggle({
  checked,
  disabled = false,
  onChange,
}: {
  /** Whether the switch is on. */
  checked: boolean;
  /** Whether a save is in flight. */
  disabled?: boolean;
  /** Called with the new position when the person flips it. */
  onChange: (checked: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.label}>{CONTACT_DISCOVERY_SETTING.label}</Text>
        <Text style={styles.detail}>{CONTACT_DISCOVERY_SETTING.detail}</Text>
      </View>
      <Switch
        accessibilityLabel={CONTACT_DISCOVERY_SETTING.label}
        disabled={disabled}
        ios_backgroundColor={colors.line}
        onValueChange={onChange}
        thumbColor={colors.white}
        trackColor={{ false: colors.line, true: colors.brand600 }}
        value={checked}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { color: colors.inkSoft, fontSize: 12, lineHeight: 17 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "500" },
  row: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  text: { flex: 1, gap: spacing.xs, minWidth: 0 },
});
