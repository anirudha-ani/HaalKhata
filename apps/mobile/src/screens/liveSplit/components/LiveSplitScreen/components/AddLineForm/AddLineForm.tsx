/** Adds a line the receipt missed. */

import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { addLine } from "@haalkhata/shared/expense/live/liveEdits";
import { parseMoneyInput } from "@haalkhata/shared/money/money";
import { MAX_EXPENSE_ITEM_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { IconButton } from "@/components/ui/IconButton";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing } from "@/lib/theme/theme";
import type { LiveSplitController } from "../../hooks/useLiveSplit";

/**
 * A name, a price and a button; the new line opens with nobody on it.
 *
 * @param props - The screen's controller.
 * @returns The form.
 */
export function AddLineForm({ live }: { live: LiveSplitController }) {
  const [name, setName] = useState("");
  const [total, setTotal] = useState("");
  const totalCents = parseMoneyInput(total, live.expense?.currency ?? "USD") ?? 0;

  return (
    <View style={styles.form}>
      <View style={styles.name}>
        <TextField
          maxLength={MAX_EXPENSE_ITEM_NAME_LENGTH}
          onChangeText={setName}
          placeholder="Add something missed"
          value={name}
        />
      </View>
      <View style={styles.price}>
        <TextField keyboardType="decimal-pad" onChangeText={setTotal} placeholder="0.00" value={total} />
      </View>
      <IconButton
        accessibilityLabel="Add line"
        disabled={name.trim() === "" || totalCents <= 0}
        icon={<Plus color={colors.white} size={18} />}
        onPress={() => {
          live.apply(addLine({ name: name.trim(), totalCents }));
          setName("");
          setTotal("");
        }}
        variant="primary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  name: {
    flex: 1,
  },
  price: {
    width: 88,
  },
});
