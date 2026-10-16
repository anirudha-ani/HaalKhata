/** Account's Notifications card on phone and tablet: which kinds of push to send, and the phones that receive them. */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { PUSH_CATEGORIES } from "@haalkhata/shared/notifications/categories";
import { PUSH_COPY } from "@haalkhata/shared/notifications/copy";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";
import { PushCategorySwitch } from "./components/PushCategorySwitch/PushCategorySwitch";
import { PushDeviceRow } from "./components/PushDeviceRow/PushDeviceRow";
import { useNotificationSettings } from "./hooks/useNotificationSettings";

/** Props for {@link NotificationSettings}. */
interface NotificationSettingsProps {
  /** The registered id of the phone the app is running on, when it has one. */
  currentDeviceId?: string;
  /** Status and controls for this phone, rendered at the top of the card. */
  thisPhone?: ReactNode;
}

/**
 * @param props - This phone's id and its section, when the app knows them.
 * @returns The card's content; the Account screen supplies the card itself.
 */
export function NotificationSettings({ currentDeviceId, thisPhone }: NotificationSettingsProps) {
  const settings = useNotificationSettings();
  return (
    <View style={styles.content}>
      <Text style={styles.hint}>{PUSH_COPY.settingHint}</Text>
      {thisPhone}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.subtitle}>{PUSH_COPY.categoriesTitle}</Text>
        {settings.preferencesLoading ? <Text style={styles.hint}>Loading…</Text> : null}
        {settings.preferencesError ? (
          <View style={styles.errorLine}>
            <Text accessibilityRole="alert" style={styles.error}>{settings.preferencesError}</Text>
            <Pressable accessibilityRole="button" onPress={settings.retryPreferences}>
              <Text style={styles.retry}>{PUSH_COPY.retry}</Text>
            </Pressable>
          </View>
        ) : null}
        {settings.preferences
          ? PUSH_CATEGORIES.map((category) => (
              <PushCategorySwitch
                key={category}
                category={category}
                enabled={settings.preferences![category]}
                saving={settings.pendingSwitch === category}
                locked={settings.pendingSwitch !== null && settings.pendingSwitch !== category}
                error={settings.switchErrors[category] ?? ""}
                onChange={(enabled) => void settings.toggle(category, enabled)}
              />
            ))
          : null}
      </View>

      <View style={[styles.section, styles.divided]}>
        <Text accessibilityRole="header" style={styles.subtitle}>{PUSH_COPY.phonesTitle}</Text>
        {settings.listNotice ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>{settings.listNotice}</Text>
        ) : null}
        {settings.devicesLoading ? <Text style={styles.hint}>Loading…</Text> : null}
        {settings.devicesError ? (
          <View style={styles.errorLine}>
            <Text accessibilityRole="alert" style={styles.error}>{settings.devicesError}</Text>
            <Pressable accessibilityRole="button" onPress={settings.retryDevices}>
              <Text style={styles.retry}>{PUSH_COPY.retry}</Text>
            </Pressable>
          </View>
        ) : null}
        {!settings.devicesLoading && !settings.devicesError && settings.devices.length === 0 ? (
          <Text style={styles.hint}>{PUSH_COPY.noPhones}</Text>
        ) : null}
        {settings.devices.map((device) => (
          <PushDeviceRow
            key={device.id}
            device={device}
            current={device.id === currentDeviceId}
            busy={settings.busyDevice === device.id}
            locked={settings.busyDevice !== null && settings.busyDevice !== device.id}
            notice={settings.deviceFeedback[device.id]?.notice ?? ""}
            error={settings.deviceFeedback[device.id]?.error ?? ""}
            onTest={() => void settings.sendTest(device.id)}
            onRemove={() => void settings.remove(device.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  section: { gap: spacing.xs },
  divided: { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: spacing.md },
  subtitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  hint: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  errorLine: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  error: { color: colors.neg700, fontSize: 13 },
  retry: { color: colors.neg700, fontSize: 13, textDecorationLine: "underline" },
  notice: { color: colors.pos700, fontSize: 13 },
});
