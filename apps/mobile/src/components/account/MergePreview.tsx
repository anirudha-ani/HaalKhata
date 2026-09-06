/** The facts about an unclaimed account a phone number would absorb. */

import type { MergePreview as MergePreviewMessage } from "@haalkhata/protogen/auth/v1/auth_pb";
import { StyleSheet, Text, View } from "react-native";
import { outstandingBuckets } from "@haalkhata/shared/money/balances";
import { formatMoney } from "@haalkhata/shared/money/money";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders what claiming a phone number would pull onto the account: the name
 * the invitation carries, how much history sits behind it, and — the part that
 * actually settles the question — who those expenses are with.
 *
 * Facts only. Each caller writes its own explanation and buttons around this,
 * because backing out reads differently during first-run than it does from
 * the account screen.
 *
 * @param props - Component props.
 * @returns The preview card.
 */
export function MergePreview({
  preview,
  currency,
}: {
  /** The server's preview of the row that would be absorbed. */
  preview: MergePreviewMessage;
  /** The caller's default currency: listed first, and the fallback label for older servers. */
  currency: string;
}) {
  // One position per currency, never a sum: a server predating `nets` sends
  // only the default-currency bucket, which reads the same way.
  const nets = outstandingBuckets(
    preview.nets?.length ? preview.nets : [{ currency, cents: preview.netCents }],
    currency,
  );
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{preview.name}</Text>
      <Text style={styles.line}>
        {preview.expenseCount} {preview.expenseCount === 1 ? "expense" : "expenses"}
        {nets.map((bucket) => (
          <Text key={bucket.currency}>
            {" · "}
            <Text style={bucket.cents > 0 ? styles.owed : styles.owes}>
              {bucket.cents > 0 ? "owed " : "owes "}
              {formatMoney(Math.abs(bucket.cents), bucket.currency)}
            </Text>
          </Text>
        ))}
      </Text>
      {preview.counterpartyNames.length > 0 ? (
        <Text style={styles.line}>Shared with {preview.counterpartyNames.join(", ")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  line: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  name: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 18,
  },
  owed: {
    color: colors.pos600,
  },
  owes: {
    color: colors.neg600,
  },
});
