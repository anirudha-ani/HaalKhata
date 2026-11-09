/** One payment made for a bill, from the reader's side, with when it was recorded. */

import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import type { Settlement } from "@haalkhata/shared/api/plainMessages";
import { expensePaymentLine } from "@haalkhata/shared/expense/repayment";
import { localDateTime } from "@haalkhata/shared/time/localTime";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * Renders "You paid Ana $4.00 via bKash" or "Bob paid you $12.00", ticked,
 * with the moment it was recorded in the reader's own time.
 *
 * @param props - Component props.
 * @returns The line.
 */
export function PaymentLine({
  payment,
  meId,
  otherFirstName,
}: {
  /** The payment. */
  payment: Settlement;
  /** The reader's id. */
  meId: string;
  /** The first name of the other person on it. */
  otherFirstName: string;
}) {
  return (
    <View style={styles.line}>
      <Check color={colors.pos600} size={14} />
      <Text style={styles.words}>{expensePaymentLine(payment, meId, otherFirstName, payment.currency)}</Text>
      <Text style={styles.time}>{localDateTime(payment.createdAt)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
  },
  time: {
    color: colors.inkSoft,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  words: {
    color: colors.inkSoft,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});
