/** The one row of the settle sheet when it pays back a bill: the bill, the balance it counts in, and what is paid. */

import { ReceiptText } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the bill a pay-back covers, as a row of the same list the sheet
 * shows balances in: its name, the balance the payment is recorded in (a
 * group's name, or "Not in any group"), and the amount, in the colour of
 * money the reader owes.
 *
 * @param props - Component props.
 * @returns The row inside its list.
 */
export function BillLine({
  description,
  scopeLabel,
  cents,
  currency,
}: {
  /** The bill's name. */
  description: string;
  /** The balance the payment counts in; "" while it is not known. */
  scopeLabel: string;
  /** What is paid, in cents. */
  cents: number;
  /** ISO 4217 code. */
  currency: string;
}) {
  return (
    <View style={styles.list}>
      <ReceiptText color={colors.inkSoft} size={16} />
      <View style={styles.words}>
        <Text numberOfLines={1} style={styles.description}>{description}</Text>
        {scopeLabel ? <Text numberOfLines={1} style={styles.scope}>{scopeLabel}</Text> : null}
      </View>
      <Text style={styles.direction}>you owe</Text>
      <Money cents={cents} currency={currency} style={styles.amount} />
    </View>
  );
}

const styles = StyleSheet.create({
  amount: {
    color: colors.neg600,
    fontSize: 14,
    fontWeight: "500",
  },
  description: {
    color: colors.ink,
    fontSize: 14,
  },
  direction: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  list: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  scope: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  words: {
    flex: 1,
    minWidth: 0,
  },
});
