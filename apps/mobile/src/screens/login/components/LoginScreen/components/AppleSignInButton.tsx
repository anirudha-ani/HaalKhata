/** Apple-branded native button on iOS, browser sign-in action on Android. */

import * as AppleAuthentication from "expo-apple-authentication";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { APPLE_SIGN_IN_UNAVAILABLE } from "@haalkhata/shared/auth/providerMessages";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { useAppleSignIn } from "../hooks/useAppleSignIn";

/**
 * Renders an accessible Apple sign-in option with cancellation and error handling.
 * @returns Apple controls or an availability message after configuration/device checks.
 */
export function AppleSignInButton() {
  const apple = useAppleSignIn();
  if (!apple.available) return apple.isLoading ? null : (
    <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.unavailable}>
      {APPLE_SIGN_IN_UNAVAILABLE}
    </Text>
  );
  return <View style={styles.container}>
    {Platform.OS === "ios" ? <View pointerEvents={apple.isPending ? "none" : "auto"}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={8} style={styles.button} onPress={apple.signIn} />
    </View> : <Button label="Continue with Apple" onPress={apple.signIn} busy={apple.isPending} variant="outline" />}
    {apple.isPending ? <ActivityIndicator accessibilityLabel="Signing in with Apple" color={colors.brand600} /> : null}
    {apple.error ? <Text accessibilityRole="alert" style={styles.error}>{apple.error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  button: { width: "100%", height: 48 },
  error: { color: colors.brand600, fontSize: 14 },
  unavailable: {
    backgroundColor: colors.paper, borderColor: colors.line, borderRadius: radii.sm,
    borderWidth: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 20, padding: spacing.md,
  },
});
