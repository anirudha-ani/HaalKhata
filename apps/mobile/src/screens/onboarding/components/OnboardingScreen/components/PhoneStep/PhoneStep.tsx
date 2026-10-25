/** The phone step: add a number, prove it with a code, and confirm any history it brings. */

import { BadgeCheck, MessageSquareText, Smartphone, UsersRound } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { ContactDiscoveryToggle } from "@/components/account/ContactDiscoveryToggle/ContactDiscoveryToggle";
import { MergePreview } from "@/components/account/MergePreview";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { CODE_STEP, MERGE_STEP, PHONE_STEP } from "../../../../constants/onboardingCopy";
import { StepArt } from "../StepArt/StepArt";
import { StepLayout } from "../StepLayout/StepLayout";
import { CodeBoxes } from "./components/CodeBoxes/CodeBoxes";
import { usePhoneStep } from "./hooks/usePhoneStep";

/**
 * Renders whichever stage the step is in:
 * - the number, with what adding it does for the person and the
 *   "let people find me" switch beside it;
 * - the code, in boxes that take iOS's one-time-code AutoFill, with a
 *   resend countdown and a way back to the number;
 * - the merge, naming exactly what an invitation holding this number
 *   would bring, with a yes and a no of equal weight.
 * Every failure shows above the step's buttons.
 *
 * @param props - Component props.
 * @returns The step.
 */
export function PhoneStep({
  user,
  onContinue,
}: {
  user: User;
  /** Moves on, with whether the number is now verified. */
  onContinue: (verified: boolean) => void;
}) {
  const phone = usePhoneStep(user, onContinue);
  const failure = phone.error ? <Text accessibilityRole="alert" style={styles.error}>{phone.error}</Text> : null;

  if (phone.stage === "merge" && phone.preview) {
    return (
      <StepLayout
        art={<StepArt><UsersRound color={colors.brand600} size={36} /></StepArt>}
        body={MERGE_STEP.body}
        footer={
          <>
            {failure}
            <Button busy={phone.busy} label={MERGE_STEP.confirm} onPress={phone.confirmMerge} />
            <Button disabled={phone.busy} label={MERGE_STEP.decline} onPress={phone.declineMerge} variant="outline" />
          </>
        }
        title={MERGE_STEP.title}
      >
        <MergePreview currency={user.defaultCurrency || "USD"} preview={phone.preview} />
        <Text style={styles.hint}>{MERGE_STEP.hint}</Text>
      </StepLayout>
    );
  }

  if (phone.stage === "code") {
    return (
      <StepLayout
        art={<StepArt><MessageSquareText color={colors.brand600} size={36} /></StepArt>}
        body={CODE_STEP.body(phone.sentTo)}
        footer={
          <>
            {failure}
            <Button
              busy={phone.isVerifying}
              disabled={phone.busy || !phone.codeComplete}
              label={CODE_STEP.verify}
              onPress={phone.verify}
            />
            <Button disabled={phone.busy} label={CODE_STEP.changeNumber} onPress={phone.changeNumber} variant="ghost" />
          </>
        }
        title={CODE_STEP.title}
      >
        <CodeBoxes
          code={phone.code}
          disabled={phone.busy}
          onChangeText={phone.enterCode}
          rejections={phone.rejections}
        />
        <View style={styles.resendRow}>
          {phone.notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>{phone.notice}</Text>
          ) : null}
          <Button
            busy={phone.isSending}
            compact
            disabled={phone.resendIn > 0 || phone.busy}
            label={phone.resendIn > 0 ? CODE_STEP.resendIn(phone.resendIn) : CODE_STEP.resend}
            onPress={phone.resend}
            variant="ghost"
          />
        </View>
      </StepLayout>
    );
  }

  return (
    <StepLayout
      art={
        <StepArt>
          {phone.alreadyVerified ? (
            <BadgeCheck color={colors.pos600} size={38} />
          ) : (
            <Smartphone color={colors.brand600} size={36} />
          )}
        </StepArt>
      }
      benefits={phone.alreadyVerified ? [] : PHONE_STEP.benefits}
      body={phone.alreadyVerified ? PHONE_STEP.verifiedBody : PHONE_STEP.body}
      footer={
        <>
          {failure}
          <Button
            busy={phone.busy}
            disabled={!phone.alreadyVerified && phone.nationalNumber.trim() === ""}
            label={phone.alreadyVerified ? PHONE_STEP.next : PHONE_STEP.sendCode}
            onPress={phone.submitNumber}
          />
          {phone.alreadyVerified ? null : (
            <Button disabled={phone.busy} label={PHONE_STEP.skip} onPress={phone.skip} variant="ghost" />
          )}
        </>
      }
      title={phone.alreadyVerified ? PHONE_STEP.verifiedTitle : PHONE_STEP.title}
    >
      <PhoneField
        nationalNumber={phone.nationalNumber}
        onNationalNumberChange={phone.setNationalNumber}
        onRegionChange={phone.setRegion}
        region={phone.region}
      />
      <View style={styles.discovery}>
        <ContactDiscoveryToggle checked={phone.findable} disabled={phone.busy} onChange={phone.setFindable} />
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  discovery: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  error: { color: colors.brand600, fontSize: 14, textAlign: "center" },
  hint: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  notice: { color: colors.pos700, fontSize: 13 },
  resendRow: { alignItems: "center", gap: spacing.xs },
});
