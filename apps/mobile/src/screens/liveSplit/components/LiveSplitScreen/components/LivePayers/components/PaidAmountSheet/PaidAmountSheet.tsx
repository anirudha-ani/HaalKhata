/** Says how much somebody paid towards the bill. */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { LIVE_PAID_HINT, whatPaid } from "@haalkhata/shared/expense/live/live.constants";
import { checkPaidAmount, setPaid } from "@haalkhata/shared/expense/live/liveEdits";
import { centsToInput } from "@haalkhata/shared/money/money";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing } from "@/lib/theme/theme";
import type { LiveSplitController } from "../../../../hooks/useLiveSplit";

/**
 * An amount, a save and a way out. Whatever is left of the bill goes to the
 * others who paid, so it always adds up.
 *
 * @param props - Who paid, what they have down so far, whether they can come
 *   off the bill's payers, what to do when finished, and the screen's controller.
 * @returns The sheet.
 */
export function PaidAmountSheet({
  userId,
  name,
  paidCents,
  canRemove,
  onDone,
  live,
}: {
  /** Who paid. */
  userId: string;
  /** What to call them. */
  name: string;
  /** What they have down so far; 0 when they are being added. */
  paidCents: number;
  /** Whether they can stop being a payer: somebody else paid too. */
  canRemove: boolean;
  /** Closes the sheet. */
  onDone: () => void;
  /** The screen's controller. */
  live: LiveSplitController;
}) {
  const currency = live.expense?.currency ?? "USD";
  const [amount, setAmount] = useState(paidCents > 0 ? centsToInput(paidCents, currency) : "");
  if (!live.state) return null;
  const check = checkPaidAmount(amount, live.state, currency);

  /**
   * Saves a figure and closes the sheet.
   *
   * @param cents - What they paid; 0 takes them off.
   */
  const save = (cents: number) => {
    live.apply(setPaid(userId, cents));
    onDone();
  };

  return (
    <Sheet
      footer={<Button disabled={check.cents <= 0} label="Save" onPress={() => save(check.cents)} />}
      onClose={onDone}
      title={`${paidCents > 0 ? "Change" : "Add"} ${whatPaid(name)}`}
    >
      <View style={styles.form}>
        <TextField keyboardType="decimal-pad" label="Amount" onChangeText={setAmount} value={amount} />
        <Text style={check.message ? styles.problem : styles.hint}>{check.message || LIVE_PAID_HINT}</Text>
        {canRemove ? <Button label="Remove" onPress={() => save(0)} variant="ghost" /> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  problem: {
    color: colors.neg600,
    fontSize: 13,
  },
});
