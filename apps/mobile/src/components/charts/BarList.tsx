/** Bar list: ranked rows, each a label, a value and a bar sized against the largest. */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { barFraction } from "@haalkhata/shared/analytics/chart";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { BAR_LIST_BAR_HEIGHT } from "./charts.constants";

/** One row of the list. */
export interface BarListRow {
  /** Stable identity for the row. */
  key: string;
  /** Optional leading element: an avatar, an emoji. */
  leading?: ReactNode;
  /** The row's name. */
  label: string;
  /** The quantity the bar encodes. */
  value: number;
  /** The quantity as a person reads it, e.g. "$120.00" or "4 expenses". */
  valueLabel: string;
  /** Optional secondary figure beside the value, e.g. "38%". */
  detail?: string;
  /** Opens what the row names, when it has a screen of its own. */
  onPress?: () => void;
}

/**
 * Renders a ranked list where each row carries its own label and value in
 * text and a thin bar showing how it compares with the largest row.
 *
 * Every bar is the same colour. The rows are names (people, categories,
 * groups), which have no order of their own, and shading them by size would
 * spend colour repeating what the bar's length already says. Because every
 * value is printed, the list is its own table.
 */
export function BarList({
  rows,
}: {
  /** The rows, largest first. */
  rows: readonly BarListRow[];
}) {
  const largest = rows.reduce((maximum, entry) => Math.max(maximum, entry.value), 0);
  return (
    <View style={styles.list}>
      {rows.map((entry) => {
        const body = (
          <>
            <View style={styles.line}>
              {entry.leading ? <View>{entry.leading}</View> : null}
              <Text numberOfLines={1} style={styles.label}>
                {entry.label}
              </Text>
              {entry.detail ? <Text style={styles.detail}>{entry.detail}</Text> : null}
              <Text style={styles.value}>{entry.valueLabel}</Text>
            </View>
            {/* The track is a lighter step of the bar's own colour, so the
                row reads as "this much of that" rather than a bar on a rule. */}
            <View style={styles.track}>
              <View
                style={[styles.bar, { width: `${barFraction(entry.value, largest) * 100}%` }]}
              />
            </View>
          </>
        );
        const accessibilityLabel = `${entry.label}: ${entry.valueLabel}${
          entry.detail ? `, ${entry.detail}` : ""
        }`;
        return entry.onPress ? (
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="link"
            key={entry.key}
            onPress={entry.onPress}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            {body}
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={accessibilityLabel} key={entry.key}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.brand500,
    borderRadius: radii.full,
    height: "100%",
  },
  detail: {
    color: colors.inkSoft,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  label: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    minWidth: 0,
  },
  line: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm + 2,
  },
  list: {
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  track: {
    backgroundColor: colors.brand50,
    borderRadius: radii.full,
    height: BAR_LIST_BAR_HEIGHT,
    marginTop: 6,
    overflow: "hidden",
  },
  value: {
    color: colors.ink,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
});
