/** Bottom sheet holding the add-friend form: email or phone, send, and the invite link for somebody not on HaalKhata. */

import { useRouter } from "expo-router";
import { Contact, Share2, UserPlus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { FIND_FRIENDS_COPY } from "@haalkhata/shared/contacts/contactsCopy";
import { NOT_ON_HAALKHATA_COPY } from "@haalkhata/shared/invite/inviteCopy";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { EmailOrPhoneField } from "@/components/ui/EmailOrPhoneField";
import { Sheet } from "@/components/ui/Sheet/Sheet";
import { colors, radii, spacing } from "@/lib/theme/theme";
import type { FriendsController } from "../../hooks/useFriends";

/**
 * The add form as a dialog, not a panel spliced into the screen: it is a
 * one-field task, and opening it must not shove the list down. It closes
 * itself once the request is sent. Finding people from contacts starts here
 * too, on its own screen. An email or phone nobody on HaalKhata has is
 * answered here, under the field, with the caller's invite link to share:
 * nothing is created for that person, who signs up as themselves.
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
    <Sheet onClose={() => friendsState.setShowAdd(false)} title="Add a friend">
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
        {friendsState.notOnHaalKhata ? (
          <View style={styles.offer}>
            <Text accessibilityRole="alert" style={styles.offerText}>
              {NOT_ON_HAALKHATA_COPY.friend.message}
            </Text>
            <Button
              busy={friendsState.isSharingInviteLink}
              icon={<Share2 color={colors.white} size={16} />}
              label={NOT_ON_HAALKHATA_COPY.friend.action}
              onPress={friendsState.shareInviteLink}
            />
          </View>
        ) : (
          <Button
            busy={friendsState.isAdding}
            disabled={!friendsState.canSubmitAdd}
            icon={<UserPlus color={colors.white} size={16} />}
            label="Send request"
            onPress={friendsState.submitAdd}
          />
        )}
        <Text style={styles.hint}>
          They must accept before either of you is added as a friend.
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
  offer: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  offerText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
});
