/** Account privacy setting: whether people can find you from their contacts. */

import { StyleSheet, View } from "react-native";
import type { ContactDiscovery } from "@haalkhata/shared/contacts/discovery";
import { ContactDiscoveryToggle } from "@/components/account/ContactDiscoveryToggle/ContactDiscoveryToggle";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";
import { useContactDiscoverySetting } from "./hooks/useContactDiscoverySetting";

/**
 * Renders the switch, saved on every flip, with its outcome beneath it.
 *
 * @param props - Component props.
 * @returns The setting.
 */
export function ContactDiscoverySetting({
  answer,
}: {
  /** The caller's stored answer. */
  answer: ContactDiscovery;
}) {
  const setting = useContactDiscoverySetting(answer);
  return (
    <View style={styles.content}>
      <ContactDiscoveryToggle
        checked={setting.checked}
        disabled={setting.busy}
        onChange={(discoverable) => void setting.change(discoverable)}
      />
      {setting.error ? (
        <Text accessibilityRole="alert" style={styles.error}>{setting.error}</Text>
      ) : null}
      {setting.notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>{setting.notice}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  error: { color: colors.neg700, fontSize: 13 },
  notice: { color: colors.pos700, fontSize: 13 },
});
