/** A notification banner drawn the way iOS shows one, for the notifications step's preview. */

import { Image, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/lib/theme/theme";
import { NOTIFICATIONS_STEP } from "../../../../../../../../constants/onboardingCopy";
import appIconSource from "../../../../../../../../../../../assets/icon.png";

/**
 * Renders one banner: the app's icon and name, "now", a bold title and a
 * line of detail, on a rounded card, so the person sees what turning
 * notifications on actually brings.
 *
 * @param props - Component props.
 * @returns The banner.
 */
export function PreviewBanner({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.banner}>
      <Image accessibilityIgnoresInvertColors source={appIconSource} style={styles.icon} />
      <View style={styles.text}>
        <View style={styles.meta}>
          <Text style={styles.app}>{NOTIFICATIONS_STEP.previewApp}</Text>
          <Text style={styles.time}>{NOTIFICATIONS_STEP.previewNow}</Text>
        </View>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        <Text numberOfLines={2} style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { color: colors.inkSoft, fontSize: 11, fontWeight: "600", letterSpacing: 0.6 },
  banner: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    width: 310,
  },
  body: { color: colors.ink, fontSize: 13 },
  icon: { borderRadius: 8, height: 36, width: 36 },
  meta: { flexDirection: "row", justifyContent: "space-between" },
  text: { flex: 1, gap: 1 },
  time: { color: colors.inkSoft, fontSize: 11 },
  title: { color: colors.ink, fontSize: 14, fontWeight: "700" },
});
