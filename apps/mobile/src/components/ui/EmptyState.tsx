/** Placeholder panel for empty lists: icon, title, hint, and optional action. */

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders a dashed placeholder panel for empty lists: an optional icon,
 * a title, an optional hint line, and an optional call-to-action element.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  /** Decorative icon element shown above the title. */
  icon?: ReactNode;
  /** Main message describing what is empty. */
  title: string;
  /** Secondary line suggesting what the user can do about it. */
  hint?: string;
  /** Call-to-action element (typically a button) rendered below the text. */
  action?: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    marginTop: spacing.md,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 14,
    maxWidth: 320,
    textAlign: "center",
  },
  icon: {
    marginBottom: spacing.xs,
  },
  panel: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: 48,
  },
  title: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "500",
  },
});
