/** Account settings: profile, payments, sharing, privacy, support and account access. */

import { ReceiptPermission } from "@/components/account/ReceiptPermission/ReceiptPermission";
import { ErrorState } from "@/components/ui/ErrorState";
import { BlockedPeople } from "@/components/safety/BlockedPeople";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { ACCOUNT_SETTINGS_COPY } from "@haalkhata/shared/account/settingsCopy";
import { Check, LogOut, Share2 } from "lucide-react-native";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { DeleteAccount } from "@/components/account/DeleteAccount";
import { MergePreview } from "@/components/account/MergePreview";
import { DetailHeader } from "@/components/shell/DetailHeader/DetailHeader";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { Screen } from "@/components/shell/Screen/Screen";
import { Avatar } from "@/components/ui/Avatar";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { InviteShareSheet } from "@/components/modals/InviteShareSheet";
import { shareProfileInvite } from "@/lib/invite/share";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { CurrencyPicker } from "@/components/ui/CurrencyPicker";
import { MAX_USER_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { PaymentMethodsSection } from "@/components/payment/PaymentMethodsSection";
import { useAccountAPI, useProfileForm } from "./hooks/useAccount";

/**
 * Renders the account screen: a spinner until the signed-in user is loaded,
 * then the profile form for that user.
 *
 * @returns The account screen content.
 */
export function AccountScreen() {
  const { me: currentUser, isLoading, loadError, retry } = useAccountAPI();
  return (
    <Screen header={<DetailHeader title="Account" />}>
      {isLoading ? <Spinner /> : !currentUser ? <ErrorState error={loadError} retry={retry} /> : <ProfileForm me={currentUser} />}
    </Screen>
  );
}

/**
 * Renders the profile summary card, the editable profile form (display
 * name, phone number, default currency), the payment methods section, the
 * sign-out button, and the phone verification and merge sheets.
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
        <View style={[styles.formColumn, isExpanded ? styles.formColumnExpanded : null]}>
          <View style={styles.formCard}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{ACCOUNT_SETTINGS_COPY.profile}</Text>
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
            <TextField
              label="Display name"
              maxLength={MAX_USER_NAME_LENGTH}
              onChangeText={form.setName}
              value={form.name}
            />

            <View style={styles.fieldBlock}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Phone number</Text>
                {currentUser.phone && form.phoneVerified ? (
                  /* The stamp is stored, not inferred (§35): numbers written
                     before verification existed must not wear it unearned. */
                  <Text style={styles.verifiedTag}>✓ verified</Text>
                ) : null}
                {currentUser.phone && !form.phoneVerified ? (
                  <>
                    <Text style={styles.unverifiedTag}>not verified</Text>
                    <Pressable
                      disabled={form.isRequestingVerification}
                      onPress={form.verifyCurrentPhone}
                    >
                      <Text style={styles.verifyNowText}>
                        {form.isRequestingVerification ? "Sending code…" : "Verify now"}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
              <PhoneField
                nationalNumber={form.nationalNumber}
                onNationalNumberChange={form.setNationalNumber}
                onRegionChange={form.setRegion}
                region={form.region}
              />
              {/* Beside the field it is about, not with the save button at the
              bottom of the form: a rejected number is something to correct
              here, and "already on another account" makes no sense read
              under the currency. */}
              {form.error ? (
                <Text style={styles.error}>{form.error}</Text>
              ) : (
                <Text style={styles.fieldHint}>
                  Only so friends can find you when they split something. Never used to sign in.
                </Text>
              )}
              {form.hasPhone ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={form.isRemovingPhone}
                  onPress={form.removePhone}
                >
                  <Text style={styles.removeLink}>
                    {form.isRemovingPhone ? "Removing…" : "Remove this number"}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Default currency</Text>
              <CurrencyPicker onChange={form.setCurrency} value={form.currency} />
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
          <PaymentMethodsSection defaultCurrency={currentUser.defaultCurrency || "USD"} />
        </View>

        <View style={[styles.preferencesColumn, isExpanded ? styles.preferencesColumnExpanded : null]}>
          <View style={styles.formCard}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{ACCOUNT_SETTINGS_COPY.sharing}</Text>
            <Text style={styles.sectionHint}>{ACCOUNT_SETTINGS_COPY.sharingHint}</Text>
            <View style={styles.shareBlock}>
              <Button
                busy={form.isSharingProfile}
                icon={<Share2 color={colors.inkSoft} size={16} />}
                label="Share my profile"
                onPress={form.shareProfile}
                variant="outline"
              />
              {form.profileNotice ? (
                <Text style={styles.shareNotice}>{form.profileNotice}</Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={form.isResettingProfileLink}
                  onPress={form.resetProfileLink}
                >
                  <Text style={styles.resetLink}>
                    {form.isResettingProfileLink
                      ? "Resetting…"
                      : ACCOUNT_SETTINGS_COPY.resetLink}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
          <View style={styles.formCard}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{ACCOUNT_SETTINGS_COPY.privacy}</Text>
            <ReceiptPermission embedded />
            <View style={styles.dividedSection}><BlockedPeople /></View>
          </View>
          <View style={styles.formCard}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{ACCOUNT_SETTINGS_COPY.support}</Text>
            <LegalLinks layout="rows" />
          </View>
        </View>
      </View>

      <View style={styles.formCard}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{ACCOUNT_SETTINGS_COPY.access}</Text>
        <View style={[styles.accountActions, isExpanded ? styles.accountActionsExpanded : null]}>
          <View style={isExpanded ? styles.accountAction : undefined}>
            <Button icon={<LogOut color={colors.inkSoft} size={16} />} label="Sign out"
              onPress={() => void form.signOut()} variant="outline" />
          </View>
          <View style={isExpanded ? styles.accountAction : undefined}><DeleteAccount /></View>
        </View>
      </View>

      {form.profileShareToken ? (
        <InviteShareSheet
          explainer="Anyone who scans this or opens the link can send you a friend request."
          onClose={form.closeProfileShare}
          share={() => shareProfileInvite(form.profileShareToken, currentUser.name)}
          title="Share my profile"
          token={form.profileShareToken}
        />
      ) : null}

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
  accountActions: { gap: spacing.sm },
  accountActionsExpanded: { flexDirection: "row" },
  accountAction: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
  dividedSection: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "600" },
  sectionHint: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
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
  fieldLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  formCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  formColumn: {
    gap: spacing.xl,
  },
  formColumnExpanded: {
    flexBasis: 0,
    flexGrow: 3,
    flexShrink: 1,
    width: 0,
  },
  preferencesColumn: {
    gap: spacing.xl,
  },
  preferencesColumnExpanded: {
    flexBasis: 0,
    flexGrow: 2,
    flexShrink: 1,
    width: 0,
  },
  profileLayout: {
    width: "100%",
    gap: spacing.xl,
  },
  profileLayoutExpanded: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.xxl,
  },
  removeLink: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  resetLink: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: spacing.sm,
    minHeight: 44,
    textAlign: "center",
  },
  shareBlock: {
    alignItems: "stretch",
    gap: spacing.sm,
  },
  shareNotice: {
    color: colors.brand700,
    fontSize: 13,
    fontWeight: "600",
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
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    paddingBottom: spacing.lg,
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
  unverifiedTag: {
    color: colors.neg700,
    fontSize: 11,
    fontWeight: "700",
  },
  verifiedTag: {
    color: colors.brand700,
    fontSize: 11,
    fontWeight: "700",
  },
  verifyNowText: {
    color: colors.brand600,
    fontSize: 11,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
