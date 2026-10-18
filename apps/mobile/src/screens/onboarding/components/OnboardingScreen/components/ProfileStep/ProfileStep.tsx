/** First step: the name friends will see, under a live preview of the avatar it makes. */

import { StyleSheet, View } from "react-native";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { MAX_USER_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { CurrencyPicker } from "@/components/ui/CurrencyPicker";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing } from "@/lib/theme/theme";
import { PROFILE_STEP } from "../../../../constants/onboardingCopy";
import { StepLayout } from "../StepLayout/StepLayout";
import { useProfileStep } from "./hooks/useProfileStep";

/**
 * Greets the person by the first name their sign-in provider gave, shows the
 * avatar friends will see (its initials follow the name as it is edited),
 * and asks for the default currency. Both fields arrive filled in, so for
 * most people this step is one tap.
 *
 * @param props - Component props.
 * @returns The step.
 */
export function ProfileStep({
  user,
  onContinue,
}: {
  user: User;
  /** Moves to the next step, after a save or a skip. */
  onContinue: () => void;
}) {
  const profile = useProfileStep(user, onContinue);
  const firstName = profile.name.trim().split(/\s+/)[0] ?? "";
  return (
    <StepLayout
      art={<Avatar size="xl" user={{ ...user, name: profile.name.trim() || user.name }} />}
      body={PROFILE_STEP.body}
      footer={
        <>
          {profile.error ? <Text accessibilityRole="alert" style={styles.error}>{profile.error}</Text> : null}
          <Button
            busy={profile.busy}
            disabled={profile.name.trim() === ""}
            label={PROFILE_STEP.next}
            onPress={profile.save}
          />
          <Button disabled={profile.busy} label={PROFILE_STEP.skip} onPress={onContinue} variant="ghost" />
        </>
      }
      title={firstName ? PROFILE_STEP.welcomeNamed(firstName) : PROFILE_STEP.welcome}
    >
      <TextField
        autoComplete="name"
        label={PROFILE_STEP.nameLabel}
        maxLength={MAX_USER_NAME_LENGTH}
        onChangeText={profile.setName}
        onSubmitEditing={profile.save}
        returnKeyType="next"
        textContentType="name"
        value={profile.name}
      />
      <View style={styles.field}>
        <Text style={styles.label}>{PROFILE_STEP.currencyLabel}</Text>
        <CurrencyPicker onChange={profile.setCurrency} value={profile.currency} />
        <Text style={styles.hint}>{PROFILE_STEP.currencyHint}</Text>
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.brand600, fontSize: 14, textAlign: "center" },
  field: { gap: spacing.sm },
  hint: { color: colors.inkSoft, fontSize: 12, lineHeight: 17 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "500" },
});
