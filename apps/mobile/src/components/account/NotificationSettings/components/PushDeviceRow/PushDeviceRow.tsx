/** One phone that receives pushes: its name, when it was last seen and notified, and its two actions. */

import { StyleSheet, View } from "react-native";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { describePushDevice, type PushDeviceSummary } from "@haalkhata/shared/notifications/settings";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";

/** Props for {@link PushDeviceRow}. */
interface PushDeviceRowProps {
  device: PushDeviceSummary;
  /** This is the phone the app is running on. */
  current: boolean;
  /** This row's action is running. */
  busy: boolean;
  /** Another row's action is running. */
  locked: boolean;
  notice: string;
  error: string;
  onTest: () => void;
  onRemove: () => void;
}

/**
 * @param props - The phone, its feedback and its handlers.
 * @returns The row, with the outcome of its last action under its buttons.
 */
export function PushDeviceRow({ device, current, busy, locked, notice, error, onTest, onRemove }: PushDeviceRowProps) {
  const description = describePushDevice(device);
  return (
    <View style={styles.row}>
      <Text style={styles.name}>
        {description.name}
        {current ? <Text style={styles.current}>{`  ·  ${PUSH_COPY.thisPhone}`}</Text> : null}
      </Text>
      <Text style={styles.detail}>{description.detail}</Text>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button busy={busy} compact disabled={locked} label={PUSH_COPY.sendTest} onPress={onTest} variant="outline" />
        </View>
        <View style={styles.action}>
          <Button compact disabled={busy || locked} label={PUSH_COPY.remove} onPress={onRemove} variant="ghost" />
        </View>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, paddingVertical: spacing.sm },
  name: { color: colors.ink, fontSize: 15, fontWeight: "500" },
  current: { color: colors.inkSoft, fontSize: 13, fontWeight: "400" },
  detail: { color: colors.inkSoft, fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
  error: { color: colors.neg700, fontSize: 13 },
  notice: { color: colors.pos700, fontSize: 13 },
});
