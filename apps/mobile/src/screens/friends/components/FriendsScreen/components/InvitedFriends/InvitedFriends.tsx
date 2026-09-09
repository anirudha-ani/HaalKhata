/** The "Invited" tab: people added by email or phone who have not joined yet. */

import { ChevronRight, Mail } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { PersonLink } from "@/components/people/PersonLink";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { FriendsController } from "../../hooks/useFriends";

/**
 * Lists Invited friends: contacts with no account yet, who can be on no
 * expense until they sign up. Each row opens their (empty) ledger, where the
 * friendship can be removed, and offers the sign-up reminder link, the one
 * useful action for someone who has not joined.
 *
 * @param props - Component props.
 * @returns The invited list, or an empty state.
 */
export function InvitedFriends({
  friendsState,
}: {
  /** The friends-screen controller from useFriends. */
  friendsState: FriendsController;
}) {
  if (friendsState.invitedFriends.length === 0) {
    return (
      <EmptyState
        hint="Someone you add who isn't on HaalKhata yet appears here until they join."
        icon={<Mail color={colors.inkSoft} size={32} />}
        title="No invited friends"
      />
    );
  }
  return (
    <View style={styles.listCard}>
      {friendsState.invitedFriends.map((friend, index) => {
        if (!friend.user) return null;
        const person = friend.user;
        return (
          <View key={person.id} style={[styles.row, index > 0 ? styles.rowDivider : null]}>
            <PersonLink meId={friendsState.me?.id} style={styles.rowLink} userId={person.id}>
              <Avatar user={person} />
              <View style={styles.text}>
                <Text numberOfLines={1} style={styles.name}>
                  {person.name}
                </Text>
                <Text style={styles.hint}>Hasn&apos;t joined yet</Text>
              </View>
              <ChevronRight color={colors.inkSoft} size={16} />
            </PersonLink>
            <Button
              busy={friendsState.remindingUserId === person.id}
              compact
              label="Remind"
              onPress={() => friendsState.remindFriend(person)}
              variant="outline"
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
  rowLink: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minWidth: 0,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
});
