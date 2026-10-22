/** The first-use explainer shown before iOS asks for notification permission. */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { Text } from "@/components/ui/Text";
import { errorMessage } from "@/lib/api/connect";
import { closePushExplainer, pushState, turnOnPush, turnThisPhoneOn, usePushState } from "@/lib/push/pushStore";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * iOS shows its alert only once per install, so this says what the
 * notifications are for first, at a moment they matter. It has one button,
 * Continue, and no way to close it: Apple asks that a screen shown before
 * its permission alert lead only to the alert, where the person says yes
 * or no (App Review has rejected a "Not now" on such screens). Should the
 * alert itself fail to appear, or the phone fail to connect after a yes, the
 * reason shows with a retry and "Not now", since there is then no alert in
 * which to decline.
 *
 * @returns The sheet while the explainer is open, otherwise nothing.
 */
export function PushPrompt() {
  const { explainerOpen } = usePushState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!explainerOpen) return null;

  /** Asks iOS, connects the phone when allowed, then closes; a phone that did not connect says why. */
  const proceed = async (): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      // After a yes whose connection failed, retry the connection, not the alert.
      const failure =
        pushState().permission === "granted"
          ? await turnThisPhoneOn().then(() => pushState().error)
          : (await turnOnPush()).error;
      if (failure) {
        setError(failure);
        return;
      }
      closePushExplainer();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  /** Leaves after the alert could not be shown. */
  const leave = () => {
    setError("");
    closePushExplainer();
  };

  return (
    <Sheet
      title={PUSH_COPY.explainerTitle}
      footer={
        error ? (
          <View style={styles.actions}>
            <Button busy={busy} label={PUSH_COPY.retry} onPress={() => void proceed()} />
            <Button disabled={busy} label={PUSH_COPY.notNow} onPress={leave} variant="ghost" />
          </View>
        ) : (
          <Button busy={busy} label={PUSH_COPY.explainerContinue} onPress={() => void proceed()} />
        )
      }
    >
      <View style={styles.body}>
        <Text style={styles.text}>{PUSH_COPY.explainerBody}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  body: { gap: spacing.lg, padding: spacing.lg },
  text: { color: colors.inkSoft, fontSize: 15, lineHeight: 22 },
  error: { color: colors.neg700, fontSize: 14 },
});
