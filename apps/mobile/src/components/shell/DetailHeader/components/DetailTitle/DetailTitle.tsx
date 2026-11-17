/** Compact title and identity rendered within the native navigation bar. */

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { HEADER_TITLE_MIN_SCALE } from "@/lib/layout/constants/layout";
import { colors, fonts, spacing } from "@/lib/theme/theme";

/**
 * Renders a screen's name and optional person/group context.
 * @param props - Screen title and optional identity.
 * @returns The existing serif title style inside Duo's native navigation bar.
 */
export function DetailTitle({ title, subtitle, leading }: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      {leading}
      <View style={styles.words}>
        <Text
          accessibilityRole="header"
          adjustsFontSizeToFit
          minimumFontScale={HEADER_TITLE_MIN_SCALE}
          numberOfLines={1}
          style={[styles.title, subtitle && styles.titleWithSubtitle]}
        >{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: spacing.sm, flexShrink: 1 },
  words: { flexShrink: 1 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "600" },
  titleWithSubtitle: { fontSize: 17 },
  subtitle: { color: colors.inkSoft, fontSize: 12 },
});
