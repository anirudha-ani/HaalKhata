/** Formatted money amount, optionally colored by owed/owing sign. */

import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { formatMoney } from "@/lib/money/money";
import { colors } from "@/lib/theme/theme";

/**
 * Renders a formatted money amount with debt semantics: positive = owed to
 * you (emerald), negative = you owe (amber). Unsigned renders in plain ink,
 * and the absolute value is always displayed.
 */
export function Money({
  cents,
  currency,
  signed = false,
  style,
}: {
  /** Amount in minor units (cents); the sign encodes debt direction. */
  cents: number;
  /** ISO 4217 currency code used for formatting. */
  currency: string;
  /** When true, colors the amount by the sign of `cents`. */
  signed?: boolean;
  /** Extra text styles merged onto the rendered amount. */
  style?: StyleProp<TextStyle>;
}) {
  const tint = !signed
    ? colors.ink
    : cents > 0
      ? colors.pos600
      : cents < 0
        ? colors.neg600
        : colors.inkSoft;
  return (
    <Text style={[styles.amount, { color: tint }, style]}>
      {formatMoney(Math.abs(cents), currency)}
    </Text>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontVariant: ["tabular-nums"],
  },
});
