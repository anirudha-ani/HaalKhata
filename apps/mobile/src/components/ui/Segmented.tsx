/** Segmented control: equal-width options on a paper track, matching the web tab switchers. */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/lib/theme/theme";

/** One option of the control. */
export interface SegmentedOption<OptionValue extends string> {
  /** The value reported when this option is chosen. */
  value: OptionValue;
  /** The option's caption. */
  label: string;
  /** How many things the option holds; zero or undefined shows no count. */
  count?: number;
  /** Whether a non-zero count wants attention (brand pill instead of a quiet one). */
  emphasis?: boolean;
}

/**
 * Renders a segmented control on the paper-colored track used across the app
 * (login mode, group tabs, split types, the friends views); the active option
 * gets a card background and brand text. An option may carry a count, quiet
 * by default and brand-coloured when it wants an answer.
 */
export function Segmented<OptionValue extends string>({
  options,
  value,
  onChange,
}: {
  /** The selectable options, in display order. */
  options: readonly SegmentedOption<OptionValue>[];
  /** The currently selected option value. */
  value: OptionValue;
  /** Called with the tapped option's value. */
  onChange: (next: OptionValue) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.track}>
      {options.map((option) => {
        const active = option.value === value;
        const count = option.count ?? 0;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            <Text style={[styles.label, active ? styles.labelActive : null]}>{option.label}</Text>
            {count > 0 ? (
              <View style={[styles.count, option.emphasis ? styles.countEmphasis : null]}>
                <Text style={[styles.countText, option.emphasis ? styles.countTextEmphasis : null]}>
                  {count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  count: {
    backgroundColor: colors.line,
    borderRadius: radii.full,
    minWidth: 18,
    paddingHorizontal: 5,
  },
  countEmphasis: {
    backgroundColor: colors.brand600,
  },
  countText: {
    color: colors.inkSoft,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center",
  },
  countTextEmphasis: {
    color: colors.white,
  },
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
    flexDirection: "row",
    gap: spacing.xs + 1,
    justifyContent: "center",
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
