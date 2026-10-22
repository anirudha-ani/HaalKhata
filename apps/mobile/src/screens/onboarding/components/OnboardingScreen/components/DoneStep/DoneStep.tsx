/** The closing screen: what setup just did, and the way into the app. */

import { useEffect } from "react";
import { Lightbulb } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { successFeedback } from "@/lib/motion/haptics";
import { colors, spacing } from "@/lib/theme/theme";
import { DONE_STEP } from "../../../../constants/onboardingCopy";
import { StepLayout } from "../StepLayout/StepLayout";
import { SuccessMark } from "./components/SuccessMark/SuccessMark";

/** What setup achieved, collected step by step. */
export interface SetupAchievements {
  phoneVerified: boolean;
  requestsSent: number;
  friendsAdded: number;
  notificationsOn: boolean;
  paymentAdded: boolean;
}

/**
 * Lists what was done in this sitting (a verified number, requests sent,
 * notifications on), so the setup ends on something concrete, with a
 * success tap as the check lands. With nothing to list, it offers two first
 * things to try instead.
 *
 * @param props - Component props.
 * @returns The step.
 */
export function DoneStep({
  firstName,
  achievements,
  error,
  pending,
  onFinish,
}: {
  firstName: string;
  achievements: SetupAchievements;
  /** Why opening the app failed; empty when it has not. */
  error: string;
  pending: boolean;
  onFinish: () => void;
}) {
  useEffect(() => {
    successFeedback();
  }, []);

  const done = [
    achievements.phoneVerified ? DONE_STEP.phoneVerified : "",
    achievements.requestsSent > 0 ? DONE_STEP.requestsSent(achievements.requestsSent) : "",
    achievements.friendsAdded > 0 ? DONE_STEP.friendsAdded(achievements.friendsAdded) : "",
    achievements.notificationsOn ? DONE_STEP.notificationsOn : "",
    achievements.paymentAdded ? DONE_STEP.paymentAdded : "",
  ].filter((line) => line !== "");

  return (
    <StepLayout
      art={<SuccessMark />}
      benefits={done}
      body={DONE_STEP.body}
      footer={
        <>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button busy={pending} label={DONE_STEP.start} onPress={onFinish} />
        </>
      }
      title={firstName ? DONE_STEP.titleNamed(firstName) : DONE_STEP.title}
    >
      {done.length === 0 ? (
        <View style={styles.tips}>
          {DONE_STEP.tips.map((tipText) => (
            <View key={tipText} style={styles.tip}>
              <Lightbulb color={colors.neg600} size={16} />
              <Text style={styles.tipText}>{tipText}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.brand600, fontSize: 14, textAlign: "center" },
  tip: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  tipText: { color: colors.ink, flex: 1, fontSize: 15, lineHeight: 21 },
  tips: { gap: spacing.md },
});
