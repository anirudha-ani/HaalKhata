/** "Continue with Google": the button, its busy state, and the last sign-in error. */

import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { colors, spacing } from "@/lib/theme/theme";
import { useGoogleSignIn } from "../../hooks/useGoogleSignIn";

/**
 * Renders the Google sign-in control. Kept in its own component so the
 * OAuth request hook only mounts when a client id is configured for this
 * platform — the provider cannot build a request without one.
 *
 * @returns The button and, below it, the most recent error.
 */
export function GoogleSignInButton() {
  const google = useGoogleSignIn();
  return (
    <View style={styles.container}>
      <Button busy={google.isPending} label="Continue with Google" onPress={google.signIn} />
      {google.error ? <Text style={styles.error}>{google.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
  },
});
