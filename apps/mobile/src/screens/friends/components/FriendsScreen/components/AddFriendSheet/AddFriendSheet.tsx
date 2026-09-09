/** Bottom sheet holding the add-friend form: email or phone, send, and the privacy note. */

import { UserPlus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { EmailOrPhoneField } from "@/components/ui/EmailOrPhoneField";
import { Sheet } from "@/components/ui/Sheet";
import { colors, spacing } from "@/lib/theme/theme";
import type { FriendsController } from "../../hooks/useFriends";

/**
 * The add form as a dialog, not a panel spliced into the screen: it is a
 * one-field task, and opening it must not shove the list down. It closes
 * itself once the request is sent.
 *
 * @param props - Component props.
 * @returns The sheet.
 */
export function AddFriendSheet({
  friendsState,
}: {
  /** The friends-screen controller from useFriends. */
  friendsState: FriendsController;
}) {
  return (
    <Sheet onClose={() => friendsState.setShowAdd(false)} title="Add a friend">
      <View style={styles.body}>
        <EmailOrPhoneField
          contact={friendsState.contact}
          emailLabel="Friend's email address"
          emailPlaceholder="Add a friend by email"
          onContactChange={friendsState.setContact}
          phoneLabel="Friend's phone number"
        />
        <Button
          busy={friendsState.isAdding}
          disabled={!friendsState.canSubmitAdd}
          icon={<UserPlus color={colors.white} size={16} />}
          label="Send request"
          onPress={friendsState.submitAdd}
        />
        <Text style={styles.hint}>
          For privacy, we won’t reveal whether that identifier has an account. They must accept
          before either of you is added as a friend.
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
});
