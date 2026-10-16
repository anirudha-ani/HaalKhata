/** Public privacy/support links available before and after authentication. */

import { useState } from "react";
import { ChevronRight, FileText, LifeBuoy } from "lucide-react-native";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { PRIVACY_PATH, SUPPORT_PATH } from "@haalkhata/shared/legal/links";
import { Button } from "@/components/ui/Button";
import { resolveApiBaseUrl } from "@/lib/api/api.constants";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * Opens public policy/help pages on this build's configured server.
 * @param props - Compact footer links or full-width settings rows.
 * @returns Accessible links with an inline failure if the browser cannot open.
 */
export function LegalLinks({ layout = "inline" }: { layout?: "inline" | "rows" }) {
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
    {layout === "rows" ? <View>
      <Pressable accessibilityRole="link" onPress={() => void openPage(PRIVACY_PATH)} style={styles.row}>
        <FileText color={colors.inkSoft} size={18} />
        <Text style={styles.rowLabel}>Privacy policy</Text>
        <ChevronRight color={colors.inkSoft} size={16} />
      </Pressable>
      <Pressable accessibilityRole="link" onPress={() => void openPage(SUPPORT_PATH)} style={[styles.row, styles.divider]}>
        <LifeBuoy color={colors.inkSoft} size={18} />
        <Text style={styles.rowLabel}>Help and support</Text>
        <ChevronRight color={colors.inkSoft} size={16} />
      </Pressable>
    </View> : <View style={styles.links}>
      <Button compact label="Privacy policy" variant="ghost" onPress={() => void openPage(PRIVACY_PATH)} />
      <Button compact label="Help and support" variant="ghost" onPress={() => void openPage(SUPPORT_PATH)} />
    </View>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48, paddingVertical: spacing.md },
  rowLabel: { color: colors.ink, fontSize: 14, fontWeight: "500", flex: 1 },
  divider: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
  error: { color: colors.neg700, fontSize: 13 },
});
