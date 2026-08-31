/** Login screen UI: Google sign-in, plus the development-only password form. */

import {
  KeyboardAvoidingView,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { TextField } from "@/components/ui/TextField";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { GOOGLE_SIGN_IN_CONFIGURED, PASSWORD_AUTH_ENABLED } from "../../constants/googleSignIn";
import { LOGIN_MODES } from "../../constants/loginModes";
import brandIconSource from "../../../../../assets/icon.png";
import { GoogleSignInButton } from "./components/GoogleSignInButton/GoogleSignInButton";
import { useLogin } from "./hooks/useLogin";

/**
 * Renders the login screen: the HaalKhata icon and wordmark, "Continue with Google"
 * (the only way in on a production server), and — in development builds
 * only, mirroring the server's password gate — the sign-in/create-account
 * toggle and credentials form for seeded accounts.
 *
 * @returns The full-height login screen.
 */
export function LoginScreen() {
  const login = useLogin();

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
          <View style={styles.hero}>
            <Image source={brandIconSource} style={styles.brandIcon} />
            <Text style={styles.wordmark}>HAALKHATA</Text>
            <Text style={styles.tagline}>
              Camera eats first. The AI splits the rest.
            </Text>
          </View>

          <View style={styles.card}>
            {GOOGLE_SIGN_IN_CONFIGURED ? (
              <GoogleSignInButton />
            ) : PASSWORD_AUTH_ENABLED ? null : (
              <Text style={styles.hint}>
                Sign-in is not configured for this build: it needs the Google client ids set at
                build time.
              </Text>
            )}

            {PASSWORD_AUTH_ENABLED ? (
              <>
                {GOOGLE_SIGN_IN_CONFIGURED ? (
                  <Text style={styles.divider}>or, in development, with a password</Text>
                ) : null}
                <Segmented
                  onChange={login.switchMode}
                  options={LOGIN_MODES}
                  value={login.mode}
                />

                <View style={styles.form}>
                  {login.mode === "signup" ? (
                    <TextField
                      autoComplete="name"
                      onChangeText={login.setName}
                      placeholder="Your name"
                      value={login.name}
                    />
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

                  {login.error ? <Text style={styles.error}>{login.error}</Text> : null}

                  <Button
                    busy={login.isPending}
                    label={login.mode === "login" ? "Sign in" : "Open your ledger"}
                    onPress={login.submit}
                    variant={GOOGLE_SIGN_IN_CONFIGURED ? "outline" : "primary"}
                  />
                </View>

                {login.mode === "signup" ? (
                  <Text style={styles.hint}>
                    Invited by a friend? Sign up with the same email or phone and
                    your shared expenses will already be here.
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brandIcon: {
    borderRadius: radii.lg,
    height: 96,
    marginBottom: spacing.lg,
    width: 96,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  divider: {
    color: colors.inkSoft,
    fontSize: 12,
    textAlign: "center",
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
  },
  flexOne: {
    flex: 1,
  },
  form: {
    gap: spacing.md,
  },
  hero: {
    alignItems: "center",
    marginBottom: spacing.xxl,
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
  tagline: {
    color: colors.inkSoft,
    fontSize: 15,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  wordmark: {
    color: colors.brand600,
    fontFamily: fonts.display,
    fontSize: 52,
    fontWeight: "700",
  },
});
