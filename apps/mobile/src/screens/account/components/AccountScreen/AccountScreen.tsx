/** Account screen: profile (name, phone, currency, payment handles), phone verification and merge, sign out. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Check, LogOut } from "lucide-react-native";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { MergePreview } from "@/components/account/MergePreview";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { useResponsiveLayout } from "@/components/shell/hooks/useResponsiveLayout";
import { Screen } from "@/components/shell/Screen";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { PhoneField } from "@/components/ui/PhoneField";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { CURRENCIES } from "@haalkhata/shared/money/money.constants";
import { HANDLE_METHODS } from "@haalkhata/shared/payment/methods";
import { MAX_USER_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { ZELLE_MODES } from "../../constants/account";
import { useAccountAPI, useProfileForm } from "./hooks/useAccount";

/**
 * Renders the account screen: a spinner until the signed-in user is loaded,
 * then the profile form for that user.
 *
 * @returns The account screen content.
 */
export function AccountScreen() {
  const { me: currentUser, isLoading } = useAccountAPI();
  return (
    <Screen header={<DetailHeader title="Account" />}>
      {isLoading || !currentUser ? <Spinner /> : <ProfileForm me={currentUser} />}
    </Screen>
  );
}

/**
 * Renders the Zelle handle field as a choice between a phone and an email,
 * because a bank registers one or the other and Zelle matches the exact
 * string. A single free-text box left people typing a bare "4015550147",
 * which is ambiguous the moment anyone is outside the US; the phone side
 * reuses {@link PhoneField} so a country code comes along by construction.
 *
 * @param props - Component props.
 * @param props.form - The profile form state from {@link useProfileForm}.
 * @returns The Zelle row of the payment handles block.
 */
function ZelleField({ form }: { form: ReturnType<typeof useProfileForm> }) {
  return (
    <View style={styles.handleBlock}>
      <View style={styles.handleHeader}>
        <Text style={styles.handleLabel}>Zelle</Text>
        <View style={styles.zelleModes}>
          <Segmented onChange={form.setZelleMode} options={ZELLE_MODES.map((mode) => ({ value: mode.key, label: mode.label }))} value={form.zelleMode} />
        </View>
      </View>
      {form.zelleMode === "phone" ? (
        <PhoneField
          label="Zelle phone number"
          nationalNumber={form.zelleNationalNumber}
          onNationalNumberChange={form.setZelleNationalNumber}
          onRegionChange={form.setZelleRegion}
          region={form.zelleRegion}
        />
      ) : (
        <TextField
          accessibilityLabel="Zelle email address"
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={(text) => form.setHandle("zelle", text)}
          placeholder="jordan@example.com"
          value={form.handles.zelle ?? ""}
        />
      )}
    </View>
  );
}

/**
 * Renders the profile summary card, the editable profile form (display
 * name, phone number, default currency, payment handles), the sign-out
 * button, and the phone verification and merge sheets.
 *
 * @param props - Component props.
 * @param props.me - The signed-in user whose profile is shown and edited.
 * @returns The profile form section of the account screen.
 */
function ProfileForm({ me: currentUser }: { me: User }) {
  const form = useProfileForm(currentUser);
  const { isExpanded } = useResponsiveLayout();

  return (
    <View style={styles.container}>
      <View style={[styles.profileLayout, isExpanded ? styles.profileLayoutExpanded : null]}>
        <View style={[styles.profileAside, isExpanded ? styles.profileAsideExpanded : null]}>
          <View style={styles.summaryCard}>
            <Avatar size="lg" user={currentUser} />
            <View style={styles.summaryText}>
              <Text numberOfLines={1} style={styles.summaryName}>
                {currentUser.name}
              </Text>
              <Text numberOfLines={1} style={styles.summaryContact}>
                {currentUser.email || currentUser.phone}
              </Text>
            </View>
          </View>

          <Button
            icon={<LogOut color={colors.inkSoft} size={16} />}
            label="Sign out"
            onPress={() => void form.signOut()}
            variant="outline"
          />
        </View>

        <View style={[styles.formCard, isExpanded ? styles.formCardExpanded : null]}>
        <TextField
          label="Display name"
          maxLength={MAX_USER_NAME_LENGTH}
          onChangeText={form.setName}
          value={form.name}
        />

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Phone number</Text>
          <PhoneField
            nationalNumber={form.nationalNumber}
            onNationalNumberChange={form.setNationalNumber}
            onRegionChange={form.setRegion}
            region={form.region}
          />
          {/* Beside the field it is about, not with the save button at the
              bottom of the form: a rejected number is something to correct
              here, and "already on another account" makes no sense read
              under the payment handles. */}
          {form.error ? (
            <Text style={styles.error}>{form.error}</Text>
          ) : (
            <Text style={styles.fieldHint}>
              Only so friends can find you when they split something. Never used to sign in.
            </Text>
          )}
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Default currency</Text>
          <View style={styles.currencyChips}>
            {CURRENCIES.map((currencyCode) => (
              <Chip
                key={currencyCode}
                label={currencyCode}
                onPress={() => form.setCurrency(currencyCode)}
                selected={form.currency === currencyCode}
              />
            ))}
          </View>
        </View>

        <View style={styles.handlesSection}>
          <Text style={styles.fieldLabel}>Get paid</Text>
          <Text style={styles.fieldHint}>
            Whoever owes you sees these when they settle up, so they can pay you without asking
            where to send it. Leave one blank if you don&apos;t use it.
          </Text>
          {HANDLE_METHODS.map((method) =>
            method.key === "zelle" ? (
              <ZelleField form={form} key={method.key} />
            ) : (
              <View key={method.key} style={styles.handleBlock}>
                <Text style={styles.handleLabel}>{method.label}</Text>
                {/* The sigil is furniture, not something to type. Rendering
                    it inside the border keeps it reading as one field while
                    removing the question of whether it belongs in the value. */}
                <View style={styles.handleInputGroup}>
                  {method.handlePrefix ? (
                    <Text style={styles.handlePrefix}>{method.handlePrefix}</Text>
                  ) : null}
                  <TextInput
                    accessibilityLabel={`${method.label} username`}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={(text) => form.setHandle(method.key, text)}
                    placeholder={method.handleExample}
                    placeholderTextColor={colors.inkSoft}
                    style={styles.handleInput}
                    value={form.handles[method.key] ?? ""}
                  />
                </View>
              </View>
            ),
          )}
        </View>

        {/* The status lives on the button that caused it: nothing moves, only
            its colour and label change. */}
        <Button
          busy={form.isSaving}
          disabled={form.name.trim() === ""}
          icon={form.saved ? <Check color={colors.white} size={16} /> : undefined}
          label={form.saved ? "Saved" : "Save changes"}
          onPress={form.save}
          variant={form.saved ? "positive" : "primary"}
        />
        </View>
      </View>

      {form.verificationPhone ? (
        <Sheet onClose={form.cancelVerification} title="Verify your phone">
          <View style={styles.sheetBody}>
            <Text style={styles.sheetText}>
              Enter the code sent to {form.verificationPhone}. No account data changes until the
              code is confirmed.
            </Text>
            <TextInput
              accessibilityLabel="Verification code"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={10}
              onChangeText={(text) => form.setVerificationCode(text.replace(/\D/g, ""))}
              style={styles.codeInput}
              textContentType="oneTimeCode"
              value={form.verificationCode}
            />
            {form.error ? <Text style={styles.error}>{form.error}</Text> : null}
            <Button
              busy={form.isSaving}
              disabled={form.verificationCode.length < 4}
              label="Verify phone"
              onPress={form.verifyPhone}
            />
          </View>
        </Sheet>
      ) : null}

      {/* A number can already belong to an invitation someone made. Nothing
          is written until this is answered, so it is a decision, not a
          notice. */}
      {form.pendingMerge ? (
        <Sheet onClose={form.declineMerge} title="Is this you?">
          <View style={styles.sheetBody}>
            <Text style={styles.sheetText}>Someone already added this number to shared expenses.</Text>
            <MergePreview currency={form.currency} preview={form.pendingMerge} />
            <Text style={styles.fieldHint}>
              If you recognize these people, this history is yours and will move onto your
              account. If you don&apos;t, the number was probably reassigned — leave it off.
            </Text>
            {form.error ? <Text style={styles.error}>{form.error}</Text> : null}
            <Button busy={form.isSaving} label="Yes, that's me" onPress={form.confirmMerge} />
            <Button
              disabled={form.isSaving}
              label="That's not me"
              onPress={form.declineMerge}
              variant="outline"
            />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  container: {
    gap: spacing.xl,
  },
  currencyChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "500",
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  fieldHint: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
  },
  formCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  formCardExpanded: {
    flex: 3,
    minWidth: 0,
  },
  handleBlock: {
    gap: spacing.xs + 2,
  },
  handleHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  handleInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    minWidth: 0,
    paddingRight: 14,
    paddingVertical: 12,
  },
  handleInputGroup: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    paddingLeft: 14,
  },
  handleLabel: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "500",
  },
  handlePrefix: {
    color: colors.inkSoft,
    fontSize: 15,
    marginRight: 2,
  },
  handlesSection: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  profileAside: {
    gap: spacing.lg,
  },
  profileAsideExpanded: {
    flex: 2,
    minWidth: 0,
  },
  profileLayout: {
    gap: spacing.xl,
  },
  profileLayoutExpanded: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.xxl,
  },
  sheetBody: {
    gap: spacing.lg,
  },
  sheetText: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  summaryCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.lg,
  },
  summaryContact: {
    color: colors.inkSoft,
    fontSize: 14,
    marginTop: 2,
  },
  summaryName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "600",
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
  },
  zelleModes: {
    width: 150,
  },
});
