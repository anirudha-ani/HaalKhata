/** The "Sent" tab: what the current user asked for and is still waiting on. */

import { Clock, Send, X } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { FriendsController } from "../../hooks/useFriends";

/**
 * Lists the requests the current user sent, each with a Cancel. A typed email
 * or phone is echoed as typed and never resolved to a name; only someone
 * picked off a screen (or reached through the profile link) shows as a
 * person. Nothing opens yet: there is no ledger until they accept.
 *
 * @param props - Component props.
 * @returns The sent-request list, or an empty state.
 */
export function SentRequests({
  friendsState,
}: {
  /** The friends-screen controller from useFriends. */
  friendsState: FriendsController;
}) {
  if (friendsState.outgoingRequests.length === 0) {
    return (
      <EmptyState
        hint="Requests you send wait here until the other person accepts them."
        icon={<Send color={colors.inkSoft} size={32} />}
        title="Nothing waiting on anyone"
      />
    );
  }
  return (
    <View style={styles.listCard}>
      {friendsState.outgoingRequests.map((request, index) => {
        const rowKey = request.user?.id ?? request.identifier;
        const shownName = request.user?.name ?? request.identifier;
        return (
          <View key={rowKey} style={[styles.row, index > 0 ? styles.rowDivider : null]}>
            {request.user ? (
              <Avatar user={request.user} />
            ) : (
              <View style={styles.identifierIcon}>
                <Clock color={colors.inkSoft} size={16} />
              </View>
            )}
            <View style={styles.text}>
              <Text numberOfLines={1} style={styles.name}>
                {shownName}
              </Text>
              <Text style={styles.hint}>Waiting for them to accept</Text>
            </View>
            <IconButton
              accessibilityLabel={`Cancel the request to ${shownName}`}
              busy={friendsState.cancellingKey === rowKey}
              icon={<X color={colors.inkSoft} size={18} />}
              onPress={() => friendsState.cancelSentRequest(request)}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  identifierIcon: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderRadius: radii.full,
    height: 36,
    justifyContent: "center",
    width: 36,
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
  text: {
    flex: 1,
    minWidth: 0,
  },
});
