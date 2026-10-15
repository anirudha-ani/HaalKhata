/** Public privacy/support links available before and after authentication. */

import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { PRIVACY_PATH, SUPPORT_PATH } from "@haalkhata/shared/legal/links";
import { Button } from "@/components/ui/Button";
import { resolveApiBaseUrl } from "@/lib/api/api.constants";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * Opens public policy/help pages on this build's configured server.
 * @returns Accessible links with an inline failure if the browser cannot open.
 */
export function LegalLinks() {
  const [error, setError] = useState("");
  /**
   * Opens a fixed public route without attaching session credentials.
   * @param pathname Privacy or support route.
   */
  const openPage = async (pathname: string) => {
    setError("");
    try { await Linking.openURL(new URL(pathname, resolveApiBaseUrl()).href); }
    catch { setError("Could not open this page. Please try again."); }
  };
  return <View style={styles.container}>
    <View style={styles.links}>
      <Button compact label="Privacy policy" variant="ghost" onPress={() => void openPage(PRIVACY_PATH)} />
      <Button compact label="Help and support" variant="ghost" onPress={() => void openPage(SUPPORT_PATH)} />
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
  error: { color: colors.neg700, fontSize: 13 },
});
