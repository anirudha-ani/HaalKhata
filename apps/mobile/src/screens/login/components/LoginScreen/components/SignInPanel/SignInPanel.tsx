/** The sign-in actions: Apple and Google at equal size, the development password link, and the legal links. */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WELCOME_SIGN_IN } from "@haalkhata/shared/welcome/welcomeCopy";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { riseIn } from "@/lib/motion/entrances";
import { useReduceMotion } from "@/lib/motion/hooks/useReduceMotion";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { GOOGLE_SIGN_IN_CONFIGURED, PASSWORD_AUTH_ENABLED } from "../../../../constants/googleSignIn";
import { AppleSignInButton } from "../AppleSignInButton/AppleSignInButton";
import { GoogleSignInButton } from "../GoogleSignInButton/GoogleSignInButton";
import { PasswordSheet } from "../PasswordSheet/PasswordSheet";

/**
 * Renders the only actions on the welcome screen. On a phone it is pinned to
 * the bottom edge, in thumb reach and visible at any text size, so someone
 * who already knows HaalKhata signs in without reading or swiping anything.
 * On iPad it is a card beside the story. Apple and Google get full-width
 * buttons of the same height (both providers' rules ask for at least equal
 * prominence), and either one creates the account on first use, which the
 * line under them says.
 *
 * @param props - Component props.
 * @returns The panel.
 */
export function SignInPanel({ variant }: { variant: "dock" | "card" }) {
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const [passwordOpen, setPasswordOpen] = useState(false);
  return (
    <Animated.View
      entering={riseIn(variant === "dock" ? 3 : 2, reduceMotion)}
      style={[
        styles.panel,
        variant === "dock" ? [styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.lg) }] : styles.card,
      ]}
    >
      <Text accessibilityRole="header" style={styles.prompt}>{WELCOME_SIGN_IN.prompt}</Text>
      <View style={styles.buttons}>
        <AppleSignInButton />
        {GOOGLE_SIGN_IN_CONFIGURED ? (
          <GoogleSignInButton />
        ) : PASSWORD_AUTH_ENABLED ? null : (
          <Text style={styles.hint}>Google sign-in is currently unavailable.</Text>
        )}
        {PASSWORD_AUTH_ENABLED ? (
          <Button compact label="Use a password (development)" onPress={() => setPasswordOpen(true)} variant="ghost" />
        ) : null}
      </View>
      <Text style={styles.hint}>{WELCOME_SIGN_IN.newcomer}</Text>
      <LegalLinks />
      {passwordOpen ? <PasswordSheet onClose={() => setPasswordOpen(false)} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  buttons: { alignSelf: "stretch", gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.07,
    shadowRadius: 28,
  },
  dock: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderTopLeftRadius: radii.lg + 8,
    borderTopRightRadius: radii.lg + 8,
    borderTopWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  hint: { color: colors.inkSoft, fontSize: 12, lineHeight: 17, textAlign: "center" },
  panel: { alignItems: "center", gap: spacing.md },
  prompt: { color: colors.ink, fontSize: 15, fontWeight: "600", textAlign: "center" },
});
