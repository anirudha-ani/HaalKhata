/** Who paid the bill, and the way for anyone else who paid to say so. */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { livePayers } from "@haalkhata/shared/expense/live/liveEdits";
import { Chip } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { LiveSplitController } from "../../hooks/useLiveSplit";
import { PaidAmountSheet } from "./components/PaidAmountSheet/PaidAmountSheet";
import { PayerRow } from "./components/PayerRow/PayerRow";

/**
 * Lists who paid. Anybody here can add themselves or somebody else, say for a
 * second card: tapping a name asks how much, and the others who paid make up
 * the rest.
 *
 * @param props - The screen's controller.
 * @returns The panel.
 */
export function LivePayers({ live }: { live: LiveSplitController }) {
  const [adding, setAdding] = useState("");
  if (!live.state) return null;
  const payers = livePayers(live.state, live.meId);
  const others = live.castIds
    .filter((userId) => !(userId in (live.state?.payers ?? {})))
    .sort((first, second) => Number(second === live.meId) - Number(first === live.meId));

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>Paid by</Text>
      {payers.map((payer) => (
        <PayerRow key={payer.userId} live={live} payer={payer} payerCount={payers.length} />
      ))}
      {live.isOpen && others.length > 0 ? (
        <View style={styles.others}>
          <Text style={styles.hint}>Also paid:</Text>
          {others.map((userId) => (
            <Chip key={userId} label={live.nameOf(userId)} onPress={() => setAdding(userId)} selected={adding === userId} />
          ))}
        </View>
      ) : null}
      {adding !== "" && others.includes(adding) ? (
        <PaidAmountSheet
          canRemove={false}
          key={adding}
          live={live}
          name={live.nameOf(adding)}
          onDone={() => setAdding("")}
          paidCents={0}
          userId={adding}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  label: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  others: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
});
