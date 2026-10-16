/** Account-wide AI scanning permission and withdrawal on phone and tablet. */

import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { RECEIPT_CONSENT_COPY } from "@haalkhata/shared/receipt/consent";
import { Button } from "@/components/ui/Button";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { useReceiptPermission } from "./hooks/useReceiptPermission";

/**
 * @param props - Whether the containing settings section supplies the card.
 * @returns Current permission and visible withdrawal feedback.
 */
export function ReceiptPermission({ embedded = false }: { embedded?: boolean }) {
  const permission = useReceiptPermission();
  return <View style={embedded ? styles.content : styles.card}>
    <Text accessibilityRole="header" style={styles.title}>{RECEIPT_CONSENT_COPY.settingTitle}</Text>
    {permission.loading ? <Text style={styles.text}>Loading permission…</Text> : permission.information ? <>
      <Text style={styles.text}>{permission.information.consentGranted ? RECEIPT_CONSENT_COPY.enabled : RECEIPT_CONSENT_COPY.disabled}</Text>
      {permission.information.consentGranted ? <>
        <Text style={styles.text}>{permission.information.disclosure}</Text>
        <Button label={RECEIPT_CONSENT_COPY.withdraw} busy={permission.busy} onPress={() => void permission.withdraw()} variant="outline" />
      </> : null}
    </> : null}
    {permission.error ? <><Text accessibilityRole="alert" style={styles.error}>{permission.error}</Text>
      <Button label="Refresh permission" onPress={() => void permission.retry()} variant="outline" /></> : null}
    {permission.notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{permission.notice}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  card: { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  text: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  error: { color: colors.neg700, fontSize: 13 },
});
