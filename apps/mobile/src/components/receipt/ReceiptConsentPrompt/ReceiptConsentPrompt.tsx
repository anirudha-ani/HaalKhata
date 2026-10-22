/** First-use receipt sharing permission, presented as a phone or tablet sheet. */

import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { RECEIPT_CONSENT_COPY } from "@haalkhata/shared/receipt/consent";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { colors, spacing } from "@/lib/theme/theme";
import type { useReceiptScanConsent } from "@/lib/receipt/hooks/useReceiptScanConsent";

/** @param props Permission flow. @returns The first-use dialog when the person requests a scan. */
export function ReceiptConsentPrompt({ consent }: { consent: ReturnType<typeof useReceiptScanConsent> }) {
  if (!consent.prompt) return null;
  return <Sheet title={RECEIPT_CONSENT_COPY.title} onClose={consent.decline} footer={
    <View style={styles.actions}>
      <Button label={RECEIPT_CONSENT_COPY.allow} busy={consent.busy} onPress={() => void consent.allow()} />
      <Button label={RECEIPT_CONSENT_COPY.decline} disabled={consent.busy} onPress={consent.decline} variant="outline" />
    </View>
  }>
    <View style={styles.body}>
      <Text style={styles.text}>{consent.prompt.disclosure}</Text>
      <Text style={styles.text}>{RECEIPT_CONSENT_COPY.remember}</Text>
      <LegalLinks />
      {consent.error ? <Text accessibilityRole="alert" style={styles.error}>{consent.error}</Text> : null}
    </View>
  </Sheet>;
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  body: { padding: spacing.lg, gap: spacing.lg },
  text: { color: colors.inkSoft, fontSize: 14, lineHeight: 21 },
  error: { color: colors.neg700, fontSize: 14 },
});
