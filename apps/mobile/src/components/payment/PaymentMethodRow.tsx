/** One payment method in the owner's "Get paid" list: its name, currency, masked summary, star and edit button. */

import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { Pencil, Star } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  methodCurrencyLabel,
  methodCurrencyPhrase,
  methodSummary,
} from "@haalkhata/shared/payment/formatMethod";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders one of the owner's payment methods.
 *
 * The summary is the method's most identifying detail with account numbers
 * masked to their last characters: this list sits on screen far more often
 * than it is read, and the full details are one tap away in the edit sheet.
 * The name shares its line with the currency only, so it is never squeezed
 * by the tag and the two buttons beside it.
 *
 * @param props - Component props.
 * @returns The list row.
 */
export function PaymentMethodRow({
  method,
  error,
  onToggleStar,
  onEdit,
}: {
  /** The method to show. */
  method: PaymentMethod;
  /** Why the last star tap on this row was refused; empty when it was not. */
  error: string;
  /** Called when the star is tapped. */
  onToggleStar: () => void;
  /** Called when the edit button is tapped. */
  onEdit: () => void;
}) {
  const currencyLabel = methodCurrencyLabel(method);
  const currencyPhrase = methodCurrencyPhrase(method);
  return (
    <View style={styles.row}>
      <View style={styles.line}>
        <View style={styles.text}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={styles.name}>
              {method.name}
            </Text>
            <Text style={styles.currency}>{currencyLabel}</Text>
          </View>
          <View style={styles.summaryLine}>
            {method.preferred ? <Text style={styles.preferred}>Preferred</Text> : null}
            <Text numberOfLines={1} style={styles.summary}>
              {methodSummary(method)}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel={
            method.preferred
              ? `${method.name} is your preferred method for ${currencyPhrase}. Remove the star`
              : `Make ${method.name} your preferred method for ${currencyPhrase}`
          }
          accessibilityRole="button"
          accessibilityState={{ selected: method.preferred }}
          onPress={onToggleStar}
          style={styles.iconButton}
        >
          <Star
            color={method.preferred ? colors.pos600 : colors.inkSoft}
            fill={method.preferred ? colors.pos600 : "transparent"}
            size={20}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={`Edit ${method.name}`}
          accessibilityRole="button"
          onPress={onEdit}
          style={styles.iconButton}
        >
          <Pencil color={colors.inkSoft} size={17} />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  currency: {
    borderColor: colors.line,
    borderRadius: radii.full,
    borderWidth: 1,
    color: colors.inkSoft,
    fontSize: 11,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  error: {
    color: colors.brand600,
    fontSize: 12,
    fontWeight: "500",
    paddingBottom: spacing.xs,
  },
  iconButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  line: {
    alignItems: "center",
    flexDirection: "row",
  },
  name: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  nameLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  preferred: {
    backgroundColor: colors.pos50,
    borderRadius: radii.full,
    color: colors.pos700,
    fontSize: 11,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  row: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  summary: {
    color: colors.inkSoft,
    flexShrink: 1,
    fontSize: 12,
  },
  summaryLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
});
