/** Tab-screen header: the wordmark plus notification bell and account avatar. */

import { useRouter } from "expo-router";
import { Bell, CircleUserRound } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { useShellData } from "./hooks/useShellData";

/**
 * Renders the chrome above every tab screen — the mobile counterpart of the
 * web's mobile header: the HaalKhata wordmark on the left, and on the right a
 * notification bell (with unread dot) leading to the activity feed and the
 * signed-in user's avatar leading to the account screen.
 *
 * @returns The header row.
 */
export function ScreenHeader() {
  const router = useRouter();
  const { currentUser, unreadCount } = useShellData();

  return (
    <View style={styles.header}>
      <View style={styles.wordmarkRow}>
        <Text style={styles.wordmark}>হালখাতা</Text>
        <Text style={styles.wordmarkLatin}>HAALKHATA</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Activity"
          hitSlop={8}
          onPress={() => router.push("/activity")}
          style={styles.iconButton}
        >
          <Bell color={colors.inkSoft} size={22} />
          {unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
        </Pressable>
        <Pressable
          accessibilityLabel="Account"
          hitSlop={8}
          onPress={() => router.push("/account")}
          style={styles.iconButton}
        >
          {currentUser ? (
            <Avatar size="sm" user={currentUser} />
          ) : (
            <CircleUserRound color={colors.inkSoft} size={22} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconButton: {
    borderRadius: radii.full,
    padding: spacing.sm,
  },
  unreadDot: {
    backgroundColor: colors.brand600,
    borderColor: colors.card,
    borderRadius: radii.full,
    borderWidth: 2,
    height: 12,
    position: "absolute",
    right: 6,
    top: 6,
    width: 12,
  },
  wordmark: {
    color: colors.brand600,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: "700",
  },
  wordmarkLatin: {
    color: colors.inkSoft,
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 3,
  },
  wordmarkRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.sm,
  },
});
