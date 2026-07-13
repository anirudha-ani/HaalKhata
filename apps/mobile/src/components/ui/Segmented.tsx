/** Segmented control: equal-width options on a paper track, matching the web tab switchers. */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders a segmented control on the paper-colored track used across the app
 * (login mode, group tabs, split types); the active option gets a card
 * background and brand text.
 */
export function Segmented<OptionValue extends string>({
  options,
  value,
  onChange,
}: {
  /** The selectable options, in display order. */
  options: readonly { value: OptionValue; label: string }[];
  /** The currently selected option value. */
  value: OptionValue;
  /** Called with the tapped option's value. */
  onChange: (next: OptionValue) => void;
}) {
  return (
    <View style={styles.track}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            <Text style={[styles.label, active ? styles.labelActive : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: "600",
  },
  labelActive: {
    color: colors.brand700,
  },
  segment: {
    alignItems: "center",
    borderRadius: radii.sm,
    flex: 1,
    paddingVertical: spacing.sm + 2,
  },
  segmentActive: {
    backgroundColor: colors.card,
  },
  track: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    padding: 4,
  },
});
