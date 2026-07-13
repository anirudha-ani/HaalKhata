/** Date input: a pressable field that opens the platform date picker. */

import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { CalendarDays } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Formats a Date as an ISO 8601 calendar date in local time.
 *
 * @param date - The date to format.
 * @returns The date as "YYYY-MM-DD".
 */
function formatISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

/**
 * Renders the app's standard date field: shows the ISO date with a calendar
 * icon and opens the native date picker on press.
 */
export function DateField({
  value,
  onChange,
  label,
}: {
  /** The current date as an ISO "YYYY-MM-DD" string. */
  value: string;
  /** Called with the new ISO date string when the user picks a date. */
  onChange: (next: string) => void;
  /** Optional caption rendered above the field. */
  label?: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  // Anchor at noon so time-zone offsets can't shift the calendar day.
  const parsed = value ? new Date(`${value}T12:00:00`) : new Date();

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable onPress={() => setShowPicker(true)} style={styles.field}>
        <Text style={styles.value}>{value}</Text>
        <CalendarDays color={colors.inkSoft} size={18} />
      </Pressable>
      {showPicker ? (
        <DateTimePicker
          mode="date"
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            setShowPicker(false);
            if (event.type !== "dismissed" && selected) onChange(formatISODate(selected));
          }}
          value={parsed}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  field: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
  },
  value: {
    color: colors.ink,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
});
