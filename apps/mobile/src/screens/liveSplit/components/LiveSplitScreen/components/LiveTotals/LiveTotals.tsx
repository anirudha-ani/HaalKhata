/** What the bill comes to for this person. */

import { StyleSheet, View } from "react-native";
import { unclaimedStaysWith } from "@haalkhata/shared/expense/live/live.constants";
import { liveTotal } from "@haalkhata/shared/expense/live/liveEdits";
import { formatMoney } from "@haalkhata/shared/money/money";
import { Text } from "@/components/ui/Text";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import type { LiveSplitController } from "../../hooks/useLiveSplit";

/**
 * Says what this bill comes to for this person and what nobody has claimed
 * yet. Whoever paid more than their share sees what they covered instead, and
 * somebody who has paid up sees that it is done.
 *
 * @param props - The screen's controller.
 * @returns The panel.
 */
export function LiveTotals({ live }: { live: LiveSplitController }) {
  const { summary, expense, state } = live;
  if (!summary || !expense || !state) return null;
  const payerNames = Object.keys(state.payers).map((userId) => (userId === live.meId ? "you" : live.nameOf(userId)));
  const total = liveTotal(state, live.meId, live.standing);

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <View style={styles.figures}>
          <Text style={styles.label}>{total.label}</Text>
          <Text style={[styles.amount, total.owing ? styles.owedByMe : styles.owedToMe]}>
            {formatMoney(total.cents, expense.currency)}
          </Text>
        </View>
      </View>
      {summary.unclaimedLines > 0 ? (
        <Text style={styles.label}>
          {formatMoney(summary.unclaimedCents, expense.currency)} not claimed yet. {unclaimedStaysWith(payerNames)}
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
