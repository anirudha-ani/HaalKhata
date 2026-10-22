/** One push category: its name, what it covers, a switch, and that switch's own error. */

import { Pressable, StyleSheet, Switch, View } from "react-native";
import type { PushCategory } from "@haalkhata/shared/notifications/categories";
import { PUSH_CATEGORY_COPY, PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";

/** Props for {@link PushCategorySwitch}. */
interface PushCategorySwitchProps {
  category: PushCategory;
  enabled: boolean;
  /** This switch is saving. */
  saving: boolean;
  /** Another switch is saving; this one waits. */
  locked: boolean;
  error: string;
  /** Asks to set the switch; on a failed save, Retry asks again for the same state. */
  onChange: (enabled: boolean) => void;
}

/**
 * @param props - The category, its state and its handler.
 * @returns A labelled switch with its failure shown right under it.
 */
export function PushCategorySwitch({ category, enabled, saving, locked, error, onChange }: PushCategorySwitchProps) {
  const copy = PUSH_CATEGORY_COPY[category];
  return (
    <View style={styles.row}>
      <View style={styles.line}>
        <View style={styles.words}>
          <Text style={styles.label}>{copy.label}</Text>
          <Text style={styles.hint}>{copy.hint}</Text>
        </View>
        <Switch
          accessibilityLabel={copy.label}
          disabled={saving || locked}
          onValueChange={onChange}
          thumbColor={colors.white}
          trackColor={{ false: colors.line, true: colors.brand600 }}
          value={enabled}
        />
      </View>
      {error ? (
        <View style={styles.errorLine}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => onChange(!enabled)}>
            <Text style={styles.retry}>{PUSH_COPY.retry}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, paddingVertical: spacing.sm },
  line: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  words: { flex: 1, gap: 2 },
  label: { color: colors.ink, fontSize: 15, fontWeight: "500" },
  hint: { color: colors.inkSoft, fontSize: 13 },
  errorLine: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  error: { color: colors.neg700, fontSize: 13 },
  retry: { color: colors.neg700, fontSize: 13, textDecorationLine: "underline" },
});
