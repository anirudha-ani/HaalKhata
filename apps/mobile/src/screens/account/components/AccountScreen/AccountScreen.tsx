/** Account screen: view/edit profile (name, default currency) and sign out. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { LogOut } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { CURRENCIES } from "@/lib/money/money.constants";
import { colors, radii, spacing } from "@/lib/theme/theme";
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
 * Renders the profile summary card, the editable profile form (display name
 * and default currency), and the sign-out button.
 *
 * @param props - Component props.
 * @param props.me - The signed-in user whose profile is shown and edited.
 * @returns The profile form section of the account screen.
 */
function ProfileForm({ me: currentUser }: { me: User }) {
  const form = useProfileForm(currentUser);

  return (
    <View style={styles.container}>
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

      <View style={styles.formCard}>
        <TextField label="Display name" onChangeText={form.setName} value={form.name} />
        <View style={styles.currencyBlock}>
          <Text style={styles.currencyLabel}>Default currency</Text>
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
        {form.message ? <Text style={styles.message}>{form.message}</Text> : null}
        <Button
          busy={form.isSaving}
          disabled={form.name.trim() === ""}
          label="Save changes"
          onPress={form.save}
        />
      </View>

      <Button
        icon={<LogOut color={colors.inkSoft} size={16} />}
        label="Sign out"
        onPress={() => void form.signOut()}
        variant="outline"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xl,
  },
  currencyBlock: {
    gap: spacing.sm,
  },
  currencyChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  currencyLabel: {
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
  message: {
    color: colors.inkSoft,
    fontSize: 14,
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
});
