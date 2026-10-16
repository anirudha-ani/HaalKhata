/** The first-use explainer shown before iOS asks for notification permission. */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { Text } from "@/components/ui/Text";
import { errorMessage } from "@/lib/api/connect";
import { closePushExplainer, turnOnPush, usePushState } from "@/lib/push/pushStore";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * iOS shows its alert only once per install, so this says what the
 * notifications are for first, at a moment they matter. One button, as
 * Apple's guidelines ask: the system alert that follows is where the person
 * says yes or no.
 *
 * @returns The sheet while the explainer is open, otherwise nothing.
 */
export function PushPrompt() {
  const { explainerOpen } = usePushState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!explainerOpen) return null;

  /** Asks iOS, connects the phone when allowed, then closes. */
  const proceed = async (): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      await turnOnPush();
      closePushExplainer();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={PUSH_COPY.explainerTitle}
      onClose={closePushExplainer}
      footer={<Button busy={busy} label={PUSH_COPY.explainerContinue} onPress={() => void proceed()} />}
    >
      <View style={styles.body}>
        <Text style={styles.text}>{PUSH_COPY.explainerBody}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, padding: spacing.lg },
  text: { color: colors.inkSoft, fontSize: 15, lineHeight: 22 },
  error: { color: colors.neg700, fontSize: 14 },
});
