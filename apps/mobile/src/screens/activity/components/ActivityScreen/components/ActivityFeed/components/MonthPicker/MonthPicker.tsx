/** Which month the feed shows: one button beside the search box, opening a sheet of months. */

import { Check, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ACTIVITY_ALL_TIME_LABEL } from "@haalkhata/shared/activity/filters";
import { monthLabel } from "@haalkhata/shared/activity/format";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the month control. The list grows every month, so it lives in a
 * sheet rather than in a row that runs off the screen. The button names the
 * month and takes the brand tint while one is chosen, because a filter has to
 * stay visible while it hides rows.
 *
 * @param props - Component props.
 * @param props.month - The chosen month key, or "" for the whole history.
 * @param props.months - The months that hold activity, newest first.
 * @param props.onChange - Called with the chosen month key, or "".
 * @returns The button and, while open, its sheet.
 */
export function MonthPicker({
  month,
  months,
  onChange,
}: {
  month: string;
  months: readonly string[];
  onChange: (month: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = month ? monthLabel(month) : ACTIVITY_ALL_TIME_LABEL;
  const options = [
    { value: "", label: ACTIVITY_ALL_TIME_LABEL },
    ...months.map((monthKey) => ({ value: monthKey, label: monthLabel(monthKey) })),
  ];

  return (
    <>
      <Pressable
        accessibilityLabel={`Month: ${current}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.field, month ? styles.fieldChosen : null]}
      >
        <Text numberOfLines={1} style={[styles.fieldText, month ? styles.fieldTextChosen : null]}>
          {current}
        </Text>
        <ChevronDown color={month ? colors.brand700 : colors.inkSoft} size={16} />
      </Pressable>
      {open ? (
        <Sheet onClose={() => setOpen(false)} title="Month">
          <View>
            {options.map((option) => (
              <Pressable
                accessibilityRole="button"
                key={option.value || "all"}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={styles.option}
              >
                <Text style={styles.optionText}>{option.label}</Text>
                {option.value === month ? <Check color={colors.brand600} size={16} /> : null}
              </Pressable>
            ))}
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
    flexShrink: 0,
    gap: spacing.xs,
    maxWidth: "60%",
    paddingHorizontal: spacing.md,
  },
  fieldChosen: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand600,
  },
  fieldText: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 15,
  },
  fieldTextChosen: {
    color: colors.brand700,
    fontWeight: "600",
  },
  option: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  optionText: {
    color: colors.ink,
    fontSize: 15,
  },
});
