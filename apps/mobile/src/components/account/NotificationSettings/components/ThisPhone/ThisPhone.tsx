/** This phone's notification status on the Account card, with the one action that fits it. */

import { StyleSheet, View } from "react-native";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";
import { useThisPhone } from "./hooks/useThisPhone";

/** @returns The status line, as an alert when connecting failed, and its action. */
export function ThisPhone() {
  const phone = useThisPhone();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.subtitle}>{PUSH_COPY.thisPhone}</Text>
      <Text
        accessibilityRole={phone.failed ? "alert" : undefined}
        accessibilityLiveRegion="polite"
        style={phone.failed ? styles.error : styles.status}
      >
        {phone.status}
      </Text>
      {phone.actionLabel ? (
        <Button busy={phone.busy} label={phone.actionLabel} onPress={phone.action} variant="outline" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  subtitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  status: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  error: { color: colors.neg700, fontSize: 13, lineHeight: 19 },
});
