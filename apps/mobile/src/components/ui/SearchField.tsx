/** Search input with a leading icon and a clear button. */

import { Search, X } from "lucide-react-native";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders a search box: a magnifier, the input, and a clear button that
 * appears once there is something to clear.
 *
 * @param props - Component props.
 * @returns The search field.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  /** Current query text. */
  value: string;
  /** Called with the new query on every keystroke. */
  onChange: (value: string) => void;
  /** Placeholder shown while empty; also names the field for screen readers. */
  placeholder: string;
  /** Whether to focus the input on mount (only for fields the user just opened). */
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.container}>
      <Search color={colors.inkSoft} size={16} />
      <TextInput
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        returnKeyType="search"
        style={styles.input}
        value={value}
      />
      {value ? (
        <Pressable
          accessibilityLabel="Clear search"
          hitSlop={8}
          onPress={() => onChange("")}
          style={styles.clear}
        >
          <X color={colors.inkSoft} size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clear: {
    borderRadius: radii.full,
    padding: spacing.xs,
  },
  container: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
});
