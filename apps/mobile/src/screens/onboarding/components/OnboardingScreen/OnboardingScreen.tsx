/** First-run screen: name, currency, phone — plus the verification and merge steps. */

import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MergePreview } from "@/components/account/MergePreview";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { PhoneField } from "@/components/ui/PhoneField";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { CURRENCIES } from "@haalkhata/shared/money/money.constants";
import { MAX_USER_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { useOnboarding } from "./hooks/useOnboarding";

/**
 * Renders the first-run flow: a short profile form, an optional phone number,
 * the code step when the number needs verifying, and — when that number turns
 * out to belong to an invitation someone already created — a confirmation
 * naming exactly what would be absorbed.
 *
 * @returns The onboarding screen.
 */
export function OnboardingScreen() {
  const onboarding = useOnboarding();
  const merge = onboarding.pendingMerge;
  const verifying = onboarding.verificationPhone !== "";

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flexOne}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {onboarding.isLoading ? (
            <Spinner />
          ) : (
            <>
              <View style={styles.hero}>
                <Text style={styles.title}>
                  {merge ? "Is this you?" : verifying ? "Verify your phone" : "Welcome to HaalKhata"}
                </Text>
                <Text style={styles.subtitle}>
                  {merge
                    ? "Someone already added this number to shared expenses."
                    : verifying
                      ? `Enter the code sent to ${onboarding.verificationPhone}.`
                      : "A couple of details, so friends can find you. You can skip any of it."}
                </Text>
              </View>

              <View style={styles.card}>
                {merge ? (
                  <>
                    <MergePreview currency={onboarding.currency || "USD"} preview={merge} />
                    <Text style={styles.hint}>
                      If you recognize these people, this history is yours and will move onto
                      your account. If you don&apos;t, the number was probably reassigned — go back
                      and leave it off.
                    </Text>
                    {onboarding.error ? <Text style={styles.error}>{onboarding.error}</Text> : null}
                    <Button
                      busy={onboarding.isPending}
                      label="Yes, that's me"
                      onPress={onboarding.confirmMerge}
                    />
                    <Button
                      disabled={onboarding.isPending}
                      label="That's not me"
                      onPress={onboarding.declineMerge}
                      variant="outline"
                    />
                  </>
                ) : verifying ? (
                  <>
                    <TextInput
                      accessibilityLabel="Verification code"
                      autoComplete="one-time-code"
                      keyboardType="number-pad"
                      maxLength={10}
                      onChangeText={(text) =>
                        onboarding.setVerificationCode(text.replace(/\D/g, ""))
                      }
                      style={styles.codeInput}
                      textContentType="oneTimeCode"
                      value={onboarding.verificationCode}
                    />
                    {onboarding.error ? <Text style={styles.error}>{onboarding.error}</Text> : null}
                    <Button
                      busy={onboarding.isPending}
                      disabled={onboarding.verificationCode.length < 4}
                      label="Verify phone"
                      onPress={onboarding.verifyPhone}
                    />
                    <Button
                      disabled={onboarding.isPending}
                      label="Use a different number"
                      onPress={onboarding.cancelVerification}
                      variant="outline"
                    />
                  </>
                ) : (
                  <>
                    <TextField
                      autoComplete="name"
                      label="Your name"
                      maxLength={MAX_USER_NAME_LENGTH}
                      onChangeText={onboarding.setName}
                      value={onboarding.name}
                    />

                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>Phone number</Text>
                      <PhoneField
                        nationalNumber={onboarding.nationalNumber}
                        onNationalNumberChange={onboarding.setNationalNumber}
                        onRegionChange={onboarding.setRegion}
                        region={onboarding.region}
                      />
                      <Text style={styles.hint}>
                        Only so friends can find you when they split something. Never used to
                        sign in.
                      </Text>
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>Default currency</Text>
                      <View style={styles.chips}>
                        {CURRENCIES.map((code) => (
                          <Chip
                            key={code}
                            label={code}
                            onPress={() => onboarding.setCurrency(code)}
                            selected={onboarding.currency === code}
                          />
                        ))}
                      </View>
                    </View>

                    {onboarding.error ? <Text style={styles.error}>{onboarding.error}</Text> : null}

                    <Button
                      busy={onboarding.isPending}
                      disabled={onboarding.name.trim() === ""}
                      label="Open your ledger"
                      onPress={onboarding.save}
                    />
                    <Button
                      disabled={onboarding.isPending}
                      label="Skip for now"
                      onPress={onboarding.skip}
                      variant="ghost"
                    />
                  </>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  codeInput: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 20,
    letterSpacing: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlign: "center",
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
  },
  flexOne: {
    flex: 1,
  },
  hero: {
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  safeArea: {
    backgroundColor: colors.paper,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  subtitle: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
});
