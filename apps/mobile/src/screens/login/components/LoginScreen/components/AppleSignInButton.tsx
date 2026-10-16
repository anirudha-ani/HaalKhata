/** Apple-branded native button on iOS, browser sign-in action on Android. */

import * as AppleAuthentication from "expo-apple-authentication";
import { ActivityIndicator, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { ProviderButton } from "./ProviderButton/ProviderButton";
import { PROVIDER_BUTTON_HEIGHT } from "../../../constants/providerButtons";
import { APPLE_SIGN_IN_UNAVAILABLE } from "@haalkhata/shared/auth/providerMessages";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { useAppleSignIn } from "../hooks/useAppleSignIn";

/**
 * Renders an accessible Apple sign-in option with cancellation and error handling.
 * @returns Apple controls or an availability message after configuration/device checks.
 */
export function AppleSignInButton() {
  const apple = useAppleSignIn();
  const { fontScale } = useWindowDimensions();
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
        cornerRadius={radii.full} style={[styles.button, { height: PROVIDER_BUTTON_HEIGHT * Math.max(1, fontScale) }]} onPress={apple.signIn} />
    </View> : <ProviderButton provider="Apple" onPress={apple.signIn} busy={apple.isPending} />}
    {Platform.OS === "ios" && apple.isPending ? <ActivityIndicator accessibilityLabel="Signing in with Apple" color={colors.brand600} /> : null}
    {apple.error ? <Text accessibilityRole="alert" style={styles.error}>{apple.error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  button: { width: "100%" },
  error: { color: colors.brand600, fontSize: 14 },
  unavailable: {
    backgroundColor: colors.paper, borderColor: colors.line, borderRadius: radii.sm,
    borderWidth: 1, color: colors.inkSoft, fontSize: 12, lineHeight: 20, padding: spacing.md,
  },
});
