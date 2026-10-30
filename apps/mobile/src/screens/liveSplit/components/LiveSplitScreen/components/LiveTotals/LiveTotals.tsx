/** What the bill comes to for this person, and the way to pay it. */

import { StyleSheet, View } from "react-native";
import { unclaimedStaysWith } from "@haalkhata/shared/expense/live/live.constants";
import { liveTotal } from "@haalkhata/shared/expense/live/liveEdits";
import { formatMoney } from "@haalkhata/shared/money/money";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import type { LiveSplitController } from "../../hooks/useLiveSplit";

/**
 * Says what this person owes, with Settle beside it, and what nobody has
 * claimed yet. Whoever paid sees what is owed to them instead, and somebody
 * who has paid up sees that it is done.
 *
 * @param props - The screen's controller.
 * @returns The panel.
 */
export function LiveTotals({ live }: { live: LiveSplitController }) {
  const { summary, expense, state } = live;
  if (!summary || !expense || !state) return null;
  const payer = live.people.get(summary.payerId);
  const payerName = summary.payerId === live.meId ? "you" : (payer?.name.split(" ")[0] ?? "whoever paid");
  const total = liveTotal(state, live.meId, live.isSettled);

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <View style={styles.figures}>
          <Text style={styles.label}>{total.label}</Text>
          <Text style={[styles.amount, total.owing ? styles.owedByMe : styles.owedToMe]}>
            {formatMoney(total.cents, expense.currency)}
          </Text>
        </View>
        {total.owing && payer && total.cents > 0 ? <Button label="Settle" onPress={live.openSettle} variant="positive" /> : null}
      </View>
      {summary.unclaimedLines > 0 ? (
        <Text style={styles.label}>
          {formatMoney(summary.unclaimedCents, expense.currency)} not claimed yet. {unclaimedStaysWith(payerName)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: "700",
  },
  figures: {
    flex: 1,
  },
  label: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  owedByMe: {
    color: colors.neg600,
  },
  owedToMe: {
    color: colors.pos700,
  },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
});
