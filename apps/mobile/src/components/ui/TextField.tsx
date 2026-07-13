/** Styled text input with an optional label, matching the web form fields. */

import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the app's standard text input — cream card background, hairline
 * border, rounded corners — with an optional label above it. All other
 * TextInput props pass through.
 */
export function TextField({
  label,
  style,
  ...inputProps
}: TextInputProps & {
  /** Optional caption rendered above the input. */
  label?: string;
}) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.inkSoft}
        {...inputProps}
        style={[styles.input, inputProps.multiline ? styles.multiline : null, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
});
