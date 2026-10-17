/** Development builds only: the email-or-phone and password form for seeded accounts, in a sheet. */

import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing } from "@/lib/theme/theme";
import { LOGIN_MODES } from "../../../../constants/loginModes";
import { useLogin } from "../../hooks/useLogin";

/**
 * Renders the password form the server only accepts in development. It sits
 * behind a link on the welcome screen so release-shaped screens stay about
 * Apple and Google, while seeded local accounts are still one tap away.
 * Failures show beside the submit button.
 *
 * @param props - Component props.
 * @returns The sheet.
 */
export function PasswordSheet({ onClose }: { onClose: () => void }) {
  const login = useLogin();
  return (
    <Sheet
      footer={
        <Button
          busy={login.isPending}
          label={login.mode === "login" ? "Sign in" : "Open your ledger"}
          onPress={login.submit}
        />
      }
      onClose={onClose}
      title="Sign in with a password"
    >
      <View style={styles.form}>
        <Text style={styles.hint}>Development builds only. Release builds offer Apple and Google.</Text>
        <Segmented onChange={login.switchMode} options={LOGIN_MODES} value={login.mode} />
        {login.mode === "signup" ? (
          <TextField autoComplete="name" onChangeText={login.setName} placeholder="Your name" value={login.name} />
        ) : null}
        <TextField
          autoCapitalize="none"
          autoComplete="username"
          keyboardType="email-address"
          onChangeText={login.setIdentifier}
          placeholder="Email or phone"
          value={login.identifier}
        />
        <TextField
          autoCapitalize="none"
          autoComplete={login.mode === "login" ? "current-password" : "new-password"}
          onChangeText={login.setPassword}
          onSubmitEditing={login.submit}
          placeholder="Password"
          secureTextEntry
          value={login.password}
        />
        {login.error ? <Text accessibilityRole="alert" style={styles.error}>{login.error}</Text> : null}
        {login.mode === "signup" ? (
          <Text style={styles.hint}>
            Invited by a friend? Sign up with the same email or phone and your shared expenses will already be here.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.brand600, fontSize: 14 },
  form: { gap: spacing.md },
  hint: { color: colors.inkSoft, fontSize: 12, lineHeight: 18 },
});
