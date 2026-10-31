/** Friends screen: three tabs (friends, requests, sent) with an add-friend sheet and settle-up. */

import { ErrorState } from "@/components/ui/ErrorState";
import { useRouter } from "expo-router";
import { Contact, UserPlus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { NOTICE_FADE_IN } from "@/lib/motion/entrances";
import { FIND_FRIENDS_COPY } from "@haalkhata/shared/contacts/contactsCopy";
import { Text } from "@/components/ui/Text";
import { InviteShareSheet } from "@/components/modals/InviteShareSheet";
import { NOT_ON_HAALKHATA_COPY } from "@haalkhata/shared/invite/inviteCopy";
import { ContactDiscoveryPrompt } from "@/components/account/ContactDiscoveryPrompt/ContactDiscoveryPrompt";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Screen } from "@/components/shell/Screen/Screen";
import { ScreenHeader } from "@/components/shell/ScreenHeader/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Spinner } from "@/components/ui/Spinner";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { FRIENDS_TABS, type FriendsTab } from "../../constants/friendsTabs";
import { AddFriendSheet } from "./components/AddFriendSheet/AddFriendSheet";
import { IncomingRequests } from "./components/IncomingRequests/IncomingRequests";
import { RegisteredFriends } from "./components/RegisteredFriends/RegisteredFriends";
import { SentRequests } from "./components/SentRequests/SentRequests";
import { useFriends } from "./hooks/useFriends";

/**
 * Renders the friends screen as three tabs. Friends: your overall position
 * and a searchable list where each row opens that friendship's ledger, with
 * a settle action that works whichever way the money is owed. Requests: what
 * awaits your answer. Sent: what you are waiting on.
 *
 * One list with sections grew past a screen as soon as a few requests were
 * pending; tabs keep each view short and give the pending ones a count you
 * can see without scrolling. Add, accept, decline and cancel report through
 * the screen's toast layer rather than a line inside a form; the one
 * exception is a contact nobody on HaalKhata has, which the add sheet
 * answers in place with the invite link to share.
 *
 * @returns The friends screen content, with a spinner while the list loads.
 */
export function FriendsScreen() {
  const friendsState = useFriends();
  const router = useRouter();
  const currency = friendsState.me?.defaultCurrency ?? "USD";
  const counts: Record<FriendsTab, number> = {
    friends: friendsState.friends.length,
    requests: friendsState.incomingRequests.length,
    sent: friendsState.outgoingRequests.length,
  };

  return (
    <Screen
      error={friendsState.showAdd ? "" : friendsState.error}
      header={<ScreenHeader />}
      onRefresh={friendsState.refresh}
      refreshing={friendsState.isRefreshing}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Friends</Text>
        <View style={styles.titleActions}>
          <Button
            compact
            icon={<Contact color={colors.inkSoft} size={16} />}
            label={FIND_FRIENDS_COPY.title}
            onPress={() => router.push("/friends/find")}
            variant="outline"
          />
          <Button
            compact
            icon={<UserPlus color={colors.white} size={16} />}
            label="Add friend"
            onPress={() => friendsState.setShowAdd(true)}
          />
        </View>
      </View>

      {/* Said once, where finding and being found matter. */}
      {friendsState.me ? <ContactDiscoveryPrompt answer={friendsState.me.contactDiscovery} /> : null}

      {/* Confirmation of the last request sent. The sheet that took it has
          closed by now, so this is the one place it can be read. */}
      {friendsState.notice ? (
        <Text accessibilityRole="text" style={styles.notice}>
          {friendsState.notice}
        </Text>
      ) : null}

      {friendsState.isLoading ? (
        <Spinner label="Loading friends…" />
      ) : friendsState.friendsError ? (
        <ErrorState error={friendsState.friendsError} retry={friendsState.refresh} />
      ) : (
        <>
          <Segmented
            onChange={friendsState.setTab}
            options={FRIENDS_TABS.map((tabOption) => ({
              value: tabOption.value,
              label: tabOption.label,
              count: counts[tabOption.value],
              emphasis: tabOption.value === "requests",
            }))}
            value={friendsState.tab}
          />
          <Animated.View entering={NOTICE_FADE_IN} key={friendsState.tab}>
          {friendsState.tab === "friends" ? (
            <RegisteredFriends currency={currency} friendsState={friendsState} />
          ) : null}
          {friendsState.tab === "requests" ? <IncomingRequests friendsState={friendsState} /> : null}
          {friendsState.tab === "sent" ? <SentRequests friendsState={friendsState} /> : null}
          </Animated.View>
        </>
      )}

      {friendsState.showAdd ? <AddFriendSheet friendsState={friendsState} /> : null}

      {friendsState.profileShareToken ? (
        <InviteShareSheet
          explainer="Anyone who scans this or opens the link can sign up and send you a friend request."
          onClose={friendsState.closeProfileShare}
          share={friendsState.profileShareToSheet}
          title={NOT_ON_HAALKHATA_COPY.friend.action}
          token={friendsState.profileShareToken}
        />
      ) : null}

      {friendsState.settleWith ? (
        <SettleUpModal
          currency={friendsState.settleWith.currency}
          onClose={() => friendsState.setSettleWith(null)}
          received={friendsState.settleWith.cents > 0}
          suggestedCents={Math.abs(friendsState.settleWith.cents)}
          to={friendsState.settleWith.user}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadError: {
    backgroundColor: colors.neg50,
    borderRadius: radii.lg,
    color: colors.neg700,
    fontSize: 14,
    fontWeight: "500",
    padding: spacing.lg,
    textAlign: "center",
  },
  notice: {
    backgroundColor: colors.pos50,
    borderRadius: radii.lg,
    color: colors.pos700,
    fontSize: 14,
    fontWeight: "500",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "700",
  },
  titleActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
});
