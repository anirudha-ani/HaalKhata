/** The notifications step: show what notifications bring, then let iOS ask once. */

import { useState } from "react";
import { StyleSheet } from "react-native";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { errorMessage } from "@/lib/api/connect";
import { successFeedback } from "@/lib/motion/haptics";
import { turnOnPush } from "@/lib/push/pushStore";
import { colors } from "@/lib/theme/theme";
import { NOTIFICATIONS_STEP } from "../../../../constants/onboardingCopy";
import { StepLayout } from "../StepLayout/StepLayout";
import { NotificationPreview } from "./components/NotificationPreview/NotificationPreview";

/**
 * Previews two real-looking notifications and says what HaalKhata sends,
 * with one button, Continue, which brings up the iOS alert: Apple asks that
 * a screen before its alert lead only to the alert, where the person says
 * yes or no. Either answer moves the flow on; a yes connects this phone
 * (the same path as the Account card) and plays a success tap.
 *
 * Should the alert itself fail to appear, the reason shows here with a retry
 * and a way past, since there is then no alert in which to decline.
 *
 * @param props - Component props.
 * @returns The step.
 */
export function NotificationsStep({ onContinue }: { onContinue: (granted: boolean) => void }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  /** Shows the iOS alert and moves on with the answer. */
  const askSystem = async () => {
    setAsking(true);
    setError("");
    try {
      const granted = (await turnOnPush()) === "granted";
      if (granted) successFeedback();
      onContinue(granted);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setAsking(false);
    }
  };

  return (
    <StepLayout
      art={<NotificationPreview />}
      body={PUSH_COPY.explainerBody}
      footer={
        error ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            <Button busy={asking} label={NOTIFICATIONS_STEP.retry} onPress={() => void askSystem()} />
            <Button label={NOTIFICATIONS_STEP.skipAfterError} onPress={() => onContinue(false)} variant="ghost" />
          </>
        ) : (
          <Button busy={asking} label={PUSH_COPY.explainerContinue} onPress={() => void askSystem()} />
        )
      }
      title={PUSH_COPY.explainerTitle}
    />
  );
}

const styles = StyleSheet.create({
  error: { color: colors.brand600, fontSize: 14, textAlign: "center" },
});
