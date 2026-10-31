/** One person who paid: how much, and the way to settle with them. */

import { Pencil } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { whatPaid } from "@haalkhata/shared/expense/live/live.constants";
import type { LivePayer } from "@haalkhata/shared/expense/live/liveEdits";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";
import type { LiveSplitController } from "../../../../hooks/useLiveSplit";
import { PaidAmountSheet } from "../PaidAmountSheet/PaidAmountSheet";

/**
 * Shows what somebody paid. Settle sits beside whoever this person owes for
 * the bill; it is there for now or for later, and nothing waits on it.
 *
 * @param props - The payer, how many people paid, and the screen's controller.
 * @returns The row.
 */
export function PayerRow({ payer, payerCount, live }: { payer: LivePayer; payerCount: number; live: LiveSplitController }) {
  const [editing, setEditing] = useState(false);
  const name = live.nameOf(payer.userId);
  const canSettle =
    payer.owedCents > 0 && live.standing.owedUserIds.includes(payer.userId) && live.people.has(payer.userId);
  // One payer covers the whole bill, so there is no figure to change.
  const canChange = live.isOpen && payerCount > 1;

  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={styles.name}>
        {name}
      </Text>
      <Money cents={payer.paidCents} currency={live.expense?.currency ?? "USD"} style={styles.amount} />
      {canChange ? (
        <IconButton
          accessibilityLabel={`Change ${whatPaid(name)}`}
          icon={<Pencil color={colors.inkSoft} size={16} />}
          onPress={() => setEditing(true)}
        />
      ) : null}
      {canSettle ? (
        <Button compact label="Settle" onPress={() => live.openSettle(payer.userId)} variant="positive" />
      ) : null}
      {editing ? (
        <PaidAmountSheet
          canRemove={payerCount > 1}
          live={live}
          name={name}
          onDone={() => setEditing(false)}
          paidCents={payer.paidCents}
          userId={payer.userId}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontSize: 15,
    fontWeight: "600",
  },
  name: {
    flex: 1,
    fontSize: 15,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
});
