/** Every browser and phone this account is signed in on, each of which can be signed out. */

import { StyleSheet, View } from "react-native";
import {
  END_OTHER_SESSIONS_CANCEL_LABEL,
  END_OTHER_SESSIONS_CONFIRM_LABEL,
  END_OTHER_SESSIONS_LABEL,
  END_OTHER_SESSIONS_WARNING,
  SESSIONS_TITLE,
} from "@haalkhata/shared/auth/sessions";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";
import { DeviceRow } from "./components/DeviceRow/DeviceRow";
import { useSignedInDevices } from "./hooks/useSignedInDevices";

/**
 * Lists where the account is signed in. Signing one out touches nothing else,
 * and that device is sent to sign in again the next time it asks for anything.
 *
 * @returns The settings section.
 */
export function SignedInDevices() {
  const devices = useSignedInDevices();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>{SESSIONS_TITLE}</Text>
      {devices.loading ? <Text style={styles.hint}>Loading your devices…</Text> : null}
      {devices.readError ? (
        <>
          <Text accessibilityRole="alert" style={styles.error}>{devices.readError}</Text>
          <Button label="Try again" onPress={() => void devices.retry()} variant="outline" />
        </>
      ) : null}
      {devices.sessions.map((session) => (
        <DeviceRow devices={devices} key={session.id} session={session} />
      ))}
      {devices.error ? <Text accessibilityRole="alert" style={styles.error}>{devices.error}</Text> : null}
      {devices.hasOthers && !devices.confirmingOthers ? (
        <Button label={END_OTHER_SESSIONS_LABEL} onPress={() => devices.setConfirmingOthers(true)} variant="outline" />
      ) : null}
      {devices.hasOthers && devices.confirmingOthers ? (
        <>
          <Text style={styles.hint}>{END_OTHER_SESSIONS_WARNING}</Text>
          <Button busy={devices.endingOthers} label={END_OTHER_SESSIONS_CONFIRM_LABEL} onPress={devices.endOthers} />
          <Button
            label={END_OTHER_SESSIONS_CANCEL_LABEL}
            onPress={() => devices.setConfirmingOthers(false)}
            variant="outline"
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.neg700,
    fontSize: 13,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  section: {
    gap: spacing.sm,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
});
