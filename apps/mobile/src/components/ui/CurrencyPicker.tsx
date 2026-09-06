/** Field + searchable sheet for choosing a currency from the full ISO catalog (§36). */

import { Check, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CURRENCIES,
  currencyInfo,
  currencyOptionLabel,
  type CurrencyInfo,
} from "@haalkhata/shared/money/money.constants";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Whether a catalog row matches a search query, on code, name, or symbol.
 *
 * @param info - Candidate currency.
 * @param query - Lowercased search text.
 * @returns True when the row should stay listed.
 */
function matches(info: CurrencyInfo, query: string): boolean {
  return (
    info.code.toLowerCase().includes(query) ||
    info.name.toLowerCase().includes(query) ||
    info.symbol.toLowerCase().includes(query)
  );
}

/**
 * Renders a currency field: a tappable row showing the current choice with
 * its symbol, opening a searchable sheet over the full catalog. The chip row
 * this replaces could offer eight currencies; a catalog of ~170 needs search
 * more than it needs everything on screen at once.
 *
 * @param props - Component props.
 * @param props.value - The selected ISO 4217 code.
 * @param props.onChange - Called with the newly picked code.
 * @returns The field and, while open, its picker sheet.
 */
export function CurrencyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = currencyInfo(value);
  const needle = query.trim().toLowerCase();
  const options = needle === "" ? CURRENCIES : CURRENCIES.filter((info) => matches(info, needle));

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Pressable
        accessibilityLabel="Currency"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={styles.field}
      >
        <Text style={styles.fieldText}>
          {selected ? currencyOptionLabel(selected) : value || "Pick a currency"}
        </Text>
        <ChevronDown color={colors.inkSoft} size={16} />
      </Pressable>
      {open ? (
        <Sheet onClose={close} title="Currency">
          <View style={styles.sheetBody}>
            <TextField
              autoCapitalize="none"
              autoCorrect={false}
              label="Search"
              onChangeText={setQuery}
              placeholder="Code or name, e.g. USD or US Dollar"
              value={query}
            />
            {options.map((info) => (
              <Pressable
                accessibilityRole="button"
                key={info.code}
                onPress={() => {
                  onChange(info.code);
                  close();
                }}
                style={styles.option}
              >
                <Text style={styles.optionSymbol}>{info.symbol}</Text>
                <View style={styles.optionNames}>
                  <Text style={styles.optionCode}>{info.code}</Text>
                  <Text numberOfLines={1} style={styles.optionName}>
                    {info.name}
                  </Text>
                </View>
                {info.code === value ? <Check color={colors.brand600} size={16} /> : null}
              </Pressable>
            ))}
            {options.length === 0 ? (
              <Text style={styles.noMatches}>No currency matches that.</Text>
            ) : null}
          </View>
        </Sheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  fieldText: {
    color: colors.ink,
    fontSize: 15,
  },
  noMatches: {
    color: colors.inkSoft,
    fontSize: 13,
    paddingVertical: spacing.md,
    textAlign: "center",
  },
  option: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  optionCode: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  optionName: {
    color: colors.inkSoft,
    flexShrink: 1,
    fontSize: 13,
  },
  optionNames: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
  },
  optionSymbol: {
    color: colors.ink,
    fontSize: 15,
    minWidth: 32,
  },
  sheetBody: {
    gap: spacing.xs,
  },
});
