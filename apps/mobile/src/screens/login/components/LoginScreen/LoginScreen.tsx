/** Login screen UI: Apple/Google sign-in and the development-only password form. */

import { KeyboardAvoidingView, Image, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { RECEIPT_PRIVACY_MESSAGE } from "@haalkhata/shared/legal/privacyCopy";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { TextField } from "@/components/ui/TextField";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { GOOGLE_SIGN_IN_CONFIGURED, PASSWORD_AUTH_ENABLED } from "../../constants/googleSignIn";
import { LOGIN_MODES } from "../../constants/loginModes";
import brandIconSource from "../../../../../assets/icon.png";
import { GoogleSignInButton } from "./components/GoogleSignInButton/GoogleSignInButton";
import { AppleSignInButton } from "./components/AppleSignInButton";
import { useLogin } from "./hooks/useLogin";
import { FOCUSED_CONTENT_MAX_WIDTH } from "@/lib/layout/constants/layout";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";

/**
 * Renders the brand, production Apple/Google sign-in and legal links. Development
 * builds also offer the password form for seeded accounts, matching the server gate.
 *
 * @returns The full-height login screen.
 */
export function LoginScreen() {
  const login = useLogin();
  const { isTablet } = useResponsiveLayout();

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flexOne}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.hero}>
              <Image source={brandIconSource} style={[styles.brandIcon, isTablet && styles.tabletIcon]} />
              <Text
                accessibilityRole="header"
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                numberOfLines={1}
                style={[styles.wordmark, isTablet && styles.tabletWordmark]}
              >HAALKHATA</Text>
              <Text style={styles.tagline}>
                Camera eats first. The AI splits the rest.
              </Text>
            </View>

            <View style={[styles.card, isTablet && styles.tabletCard]}>
            <AppleSignInButton />
            {GOOGLE_SIGN_IN_CONFIGURED ? (
              <GoogleSignInButton />
            ) : PASSWORD_AUTH_ENABLED ? null : (
              <Text style={styles.hint}>
                Google sign-in is currently unavailable.
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
            <View style={styles.privacyFooter}>
              <Text style={styles.privacyMessage}>{RECEIPT_PRIVACY_MESSAGE}</Text>
              <LegalLinks />
            </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brandIcon: {
    borderRadius: radii.lg,
    height: 64,
    marginBottom: spacing.lg,
    width: 64,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  content: {
    maxWidth: FOCUSED_CONTENT_MAX_WIDTH,
    width: "100%",
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
    marginBottom: spacing.xl,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  privacyFooter: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  privacyMessage: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 20,
  },
  safeArea: {
    backgroundColor: colors.paper,
    flex: 1,
  },
  scrollContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  tagline: {
    color: colors.inkSoft,
    fontSize: 15,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  tabletCard: {
    padding: spacing.xl,
  },
  tabletIcon: {
    height: 80,
    width: 80,
  },
  tabletWordmark: {
    fontSize: 44,
  },
  wordmark: {
    alignSelf: "stretch",
    color: colors.brand600,
    fontFamily: fonts.display,
    fontSize: 36,
    fontWeight: "700",
    textAlign: "center",
  },
});
