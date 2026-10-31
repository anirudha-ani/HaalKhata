/** One place this account is signed in. */

import { Globe, Smartphone } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { END_SESSION_LABEL, sessionDetail } from "@haalkhata/shared/auth/sessions";
import type { Session } from "@haalkhata/protogen/auth/v1/auth_pb";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";
import type { SignedInDevicesController } from "../../hooks/useSignedInDevices";

/**
 * Shows what a device is and how recently it was used. The one being used has
 * no button here: Sign out, further down, is how to leave it.
 *
 * @param props - The sign-in and the list's controller.
 * @returns The row.
 */
export function DeviceRow({ session, devices }: { session: Session; devices: SignedInDevicesController }) {
  const Icon = session.isApp ? Smartphone : Globe;
  return (
    <View style={styles.row}>
      <Icon color={colors.inkSoft} size={20} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.name}>{session.device}</Text>
        <Text style={session.current ? styles.thisDevice : styles.detail}>{sessionDetail(session, devices.clock)}</Text>
      </View>
      {session.current ? null : (
        <Button
          busy={devices.endingId === session.id}
          compact
          label={END_SESSION_LABEL}
          onPress={() => devices.endOne(session.id)}
          variant="outline"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  detail: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  name: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
  },
  thisDevice: {
    color: colors.pos700,
    fontSize: 12,
    fontWeight: "600",
  },
});
