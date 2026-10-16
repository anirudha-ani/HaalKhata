/** The "How" chips of the settle sheet: the person's payment methods for this currency, then Cash and Other. */

import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { Star } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Chip } from "@/components/ui/Chip";
import { methodDisplayName } from "@haalkhata/shared/payment/formatMethod";
import { PLAIN_PAY_CHOICES } from "@haalkhata/shared/payment/payeeMethods";
import { colors, spacing } from "@/lib/theme/theme";

/**
 * Renders the ways this payment can be made.
 *
 * First the methods that work in the payment's currency, the starred one
 * leading and marked, so the right choice is obvious before anything is
 * tapped. Then Cash and Other, which need nobody's details. Methods tied to
 * another currency come last under their own line: they are real ways to
 * reach the person, but using one means converting the amount, and the
 * sheet does not pretend otherwise by mixing them in.
 *
 * @param props - Component props.
 * @returns The chip groups, each wrapping onto more lines as needed.
 */
export function PayMethodChips({
  usable,
  others,
  choice,
  onPick,
}: {
  /** Methods that work in the payment's currency, best first. */
  usable: readonly PaymentMethod[];
  /** Methods tied to another currency. */
  others: readonly PaymentMethod[];
  /** The selection: a method's id or a plain choice's key. */
  choice: string;
  /** Called with the id or key picked. */
  onPick: (choice: string) => void;
}) {
  return (
    <View style={styles.groups}>
      <View style={styles.chips}>
        {usable.map((method) => (
          <Chip
            icon={
              method.preferred ? (
                <Star color={colors.pos600} fill={colors.pos600} size={13} />
              ) : undefined
            }
            key={method.id}
            // Read out too: a star alone says nothing to a screen reader.
            label={
              method.preferred
                ? `${methodDisplayName(method)} · Preferred`
                : methodDisplayName(method)
            }
            onPress={() => onPick(method.id)}
            selected={choice === method.id}
          />
        ))}
        {PLAIN_PAY_CHOICES.map((plain) => (
          <Chip
            key={plain.key}
            label={plain.label}
            onPress={() => onPick(plain.key)}
            selected={choice === plain.key}
          />
        ))}
      </View>
      {others.length > 0 ? (
        <View style={styles.otherGroup}>
          <Text style={styles.otherLabel}>Works in other currencies</Text>
          <View style={styles.chips}>
            {others.map((method) => (
              <Chip
                key={method.id}
                label={`${methodDisplayName(method)} · ${method.currency}`}
                onPress={() => onPick(method.id)}
                selected={choice === method.id}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  groups: {
    gap: spacing.sm,
  },
  otherGroup: {
    gap: spacing.xs + 2,
  },
  otherLabel: {
    color: colors.inkSoft,
    fontSize: 12,
  },
});
