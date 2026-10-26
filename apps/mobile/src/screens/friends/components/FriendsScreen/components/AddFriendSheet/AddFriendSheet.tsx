/** Bottom sheet holding the add-friend form: email or phone, send, and the privacy note. */

import { useRouter } from "expo-router";
import { Contact, UserPlus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { FIND_FRIENDS_COPY } from "@haalkhata/shared/contacts/contactsCopy";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { EmailOrPhoneField } from "@/components/ui/EmailOrPhoneField";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { colors, spacing } from "@/lib/theme/theme";
import type { FriendsController } from "../../hooks/useFriends";

/**
 * The add form as a dialog, not a panel spliced into the screen: it is a
 * one-field task, and opening it must not shove the list down. It closes
 * itself once the request is sent. Finding people from contacts starts here
 * too, on its own screen.
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
  const router = useRouter();
  return (
    <Sheet
      footer={
        <View style={styles.body}>
          {friendsState.error ? <Text accessibilityRole="alert" style={styles.error}>{friendsState.error}</Text> : null}
          <Button
            busy={friendsState.isAdding}
            disabled={!friendsState.canSubmitAdd}
            icon={<UserPlus color={colors.white} size={16} />}
            label="Send request"
            onPress={friendsState.submitAdd}
          />
        </View>
      }
      onClose={() => friendsState.setShowAdd(false)}
      title="Add a friend"
    >
      <View style={styles.body}>
        <Button
          icon={<Contact color={colors.inkSoft} size={16} />}
          label={FIND_FRIENDS_COPY.entry}
          onPress={() => {
            friendsState.setShowAdd(false);
            router.push("/friends/find");
          }}
          variant="outline"
        />
        <EmailOrPhoneField
          contact={friendsState.contact}
          emailLabel="Friend's email address"
          emailPlaceholder="Add a friend by email"
          onContactChange={friendsState.setContact}
          phoneLabel="Friend's phone number"
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
  error: {
    color: colors.neg700,
    fontSize: 13,
  },
  body: {
    gap: spacing.md,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
});
