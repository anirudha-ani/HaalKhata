/** One line of the bill: what it was, who had it, and for those who can still change it, how. */

import { Pencil, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { lineShareCents, removeLine, setLineDetails, setOnLine } from "@haalkhata/shared/expense/live/liveEdits";
import type { LineState } from "@haalkhata/shared/expense/merge/expenseState";
import { centsToInput, parseMoneyInput } from "@haalkhata/shared/money/money";
import { MAX_EXPENSE_ITEM_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { IconButton } from "@/components/ui/IconButton";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing } from "@/lib/theme/theme";
import type { LiveSplitController } from "../../hooks/useLiveSplit";

/**
 * Shows a line with a chip per person; tapping one puts them on it or takes
 * them off. Anybody at the table can do that for anybody, the way a bill is
 * sorted out out loud. Correcting the line opens a sheet, so a change from
 * somebody else cannot move it under their finger.
 *
 * @param props - The line and the screen's controller.
 * @returns The line.
 */
export function LiveLine({ line, live }: { line: LineState; live: LiveSplitController }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(line.name);
  const [total, setTotal] = useState("");
  const currency = live.expense?.currency ?? "USD";
  const myShare = lineShareCents(line, live.meId);
  const unclaimed = Object.keys(line.shares).length === 0;
  const parsedTotal = parseMoneyInput(total, currency) ?? 0;

  /** Opens the correction with the line as it is now. */
  const startEditing = () => {
    setName(line.name);
    setTotal(centsToInput(line.totalCents, currency));
    setEditing(true);
  };

  return (
    <View style={styles.line}>
      <View style={styles.heading}>
        <Text numberOfLines={2} style={styles.name}>
          {line.quantity > 1 ? `${line.quantity}× ` : ""}
          {line.name}
        </Text>
        <Money cents={line.totalCents} currency={currency} style={styles.price} />
        {live.isOpen && line.id !== "" ? (
          <>
            <IconButton
              accessibilityLabel={`Change ${line.name}`}
              icon={<Pencil color={colors.inkSoft} size={16} />}
              onPress={startEditing}
            />
            <IconButton
              accessibilityLabel={`Remove ${line.name}`}
              disabled={(live.state?.lines.length ?? 0) < 2}
              icon={<Trash2 color={colors.inkSoft} size={16} />}
              onPress={() => live.apply(removeLine(line.id))}
            />
          </>
        ) : null}
      </View>

      <View style={styles.people}>
        {live.castIds.map((userId) => {
          const isOn = (line.shares[userId] ?? 0) > 0;
          return (
            <Chip
              disabled={!live.isOpen || line.id === ""}
              key={userId}
              label={userId === live.meId ? "You" : (live.people.get(userId)?.name.split(" ")[0] ?? "Someone")}
              onPress={() => live.apply(setOnLine(line.id, userId, !isOn))}
              selected={isOn}
            />
          );
        })}
      </View>
      {unclaimed ? <Text style={styles.hint}>Not claimed yet</Text> : null}
      {myShare !== null ? (
        <Text style={styles.hint}>
          Your part <Money cents={myShare} currency={currency} style={styles.hint} />
        </Text>
      ) : null}

      {editing ? (
        <Sheet
          footer={
            <Button
              disabled={name.trim() === "" || parsedTotal <= 0}
              label="Save"
              onPress={() => {
                live.apply(setLineDetails(line.id, { name: name.trim(), totalCents: parsedTotal }));
                setEditing(false);
              }}
            />
          }
          onClose={() => setEditing(false)}
          title={`Change ${line.name}`}
        >
          <View style={styles.form}>
            <TextField
              label="Name"
              maxLength={MAX_EXPENSE_ITEM_NAME_LENGTH}
              onChangeText={setName}
              value={name}
            />
            <TextField keyboardType="decimal-pad" label="Price" onChangeText={setTotal} value={total} />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  heading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  line: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  name: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  people: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  price: {
    fontSize: 15,
    fontWeight: "600",
  },
});
