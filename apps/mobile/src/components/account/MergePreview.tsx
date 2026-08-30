/** The facts about an unclaimed account a phone number would absorb. */

import type { MergePreview as MergePreviewMessage } from "@haalkhata/protogen/auth/v1/auth_pb";
import { StyleSheet, Text, View } from "react-native";
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
  /** ISO 4217 code to render the net position in. */
  currency: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{preview.name}</Text>
      <Text style={styles.line}>
        {preview.expenseCount} {preview.expenseCount === 1 ? "expense" : "expenses"}
        {preview.netCents !== 0 ? (
          <>
            {" · "}
            <Text style={preview.netCents > 0 ? styles.owed : styles.owes}>
              {preview.netCents > 0 ? "owed " : "owes "}
              {formatMoney(Math.abs(preview.netCents), currency)}
            </Text>
          </>
        ) : null}
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
