/** The "Requests" tab: people waiting on the current user's answer. */

import { Check, Inbox, X } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { FriendsController } from "../../hooks/useFriends";

/**
 * Lists incoming requests with icon-only Accept and Decline on each row; the
 * accessibility labels carry the words and the person's name.
 *
 * @param props - Component props.
 * @returns The request list, or an empty state.
 */
export function IncomingRequests({
  friendsState,
}: {
  /** The friends-screen controller from useFriends. */
  friendsState: FriendsController;
}) {
  if (friendsState.incomingRequests.length === 0) {
    return (
      <EmptyState
        hint="When someone asks to connect, they show up here for you to accept or decline."
        icon={<Inbox color={colors.inkSoft} size={32} />}
        title="No friend requests"
      />
    );
  }
  return (
    <View style={styles.listCard}>
      {friendsState.incomingRequests.map((requester, index) => {
        const responding = friendsState.respondingUserId === requester.id;
        return (
          <View key={requester.id} style={[styles.row, index > 0 ? styles.rowDivider : null]}>
            <Avatar user={requester} />
            <Text numberOfLines={1} style={styles.name}>
              {requester.name}
            </Text>
            <View style={styles.actions}>
              <IconButton
                accessibilityLabel={`Decline ${requester.name}`}
                busy={responding && !friendsState.respondingAccept}
                disabled={responding}
                icon={<X color={colors.inkSoft} size={18} />}
                onPress={() => friendsState.respondToRequest(requester.id, false)}
              />
              <IconButton
                accessibilityLabel={`Accept ${requester.name}`}
                busy={responding && friendsState.respondingAccept}
                disabled={responding}
                icon={<Check color={colors.white} size={18} />}
                onPress={() => friendsState.respondToRequest(requester.id, true)}
                variant="primary"
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  listCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  name: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
});
