/** Insight card: the titled frame every block of the insights dashboard sits in. */

import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders a card with a title, an optional line saying what the figures
 * mean, and the block's content.
 */
export function InsightCard({
  title,
  subtitle,
  style,
  children,
}: {
  /** What the block shows. */
  title: string;
  /** How to read it, when the title alone leaves that open. */
  subtitle?: string;
  /** Layout styles for the card, e.g. its share of a row. */
  style?: StyleProp<ViewStyle>;
  /** The block's content. */
  children: ReactNode;
}) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    minWidth: 0,
    padding: spacing.lg,
  },
  header: {
    gap: 2,
    marginBottom: spacing.md,
  },
  subtitle: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: "600",
  },
});
