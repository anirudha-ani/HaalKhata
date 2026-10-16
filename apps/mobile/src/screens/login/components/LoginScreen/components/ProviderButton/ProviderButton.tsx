/** Branded Google and browser-based Apple actions with matching native geometry. */

import { ActivityIndicator, Image, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import VectorIcon, { Path } from "react-native-svg";
import { APPLE_LOGO_PATH, APPLE_LOGO_VIEW_BOX } from "@haalkhata/shared/auth/providerArtwork";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { PROVIDER_BUTTON_HEIGHT } from "../../../../constants/providerButtons";
import googleLogo from "../../../../../../../assets/providers/google.png";

/**
 * Keeps logos proportional and text readable while disabling duplicate attempts.
 * @param props - Provider identity, pending state and existing sign-in action.
 * @returns A white outlined provider button; iOS Apple uses its native SDK control.
 */
export function ProviderButton({ provider, busy, onPress }: {
  provider: "Apple" | "Google";
  busy: boolean;
  onPress: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Continue with ${provider}`}
      accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress}
      style={({ pressed }) => [styles.button, { minHeight: PROVIDER_BUTTON_HEIGHT * Math.max(1, fontScale) },
        (pressed || busy) && styles.dimmed]}>
      {busy ? <ActivityIndicator color={colors.providerInk} size="small" /> : provider === "Google" ? (
        <Image accessible={false} source={googleLogo} style={styles.logo} resizeMode="contain" />
      ) : (
        <VectorIcon accessibilityElementsHidden importantForAccessibility="no" width={20} height={20} viewBox={APPLE_LOGO_VIEW_BOX}>
          <Path d={APPLE_LOGO_PATH} fill={colors.providerInk} />
        </VectorIcon>
      )}
      <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
        {busy ? "Signing in…" : `Continue with ${provider}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.md,
    width: "100%", borderRadius: radii.full, borderWidth: 1, borderColor: colors.providerLine,
    backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  label: { color: colors.providerInk, fontSize: 17, fontWeight: "500", textAlign: "center", flexShrink: 1 },
  logo: { width: 20, height: 20 },
  dimmed: { opacity: 0.6 },
});
