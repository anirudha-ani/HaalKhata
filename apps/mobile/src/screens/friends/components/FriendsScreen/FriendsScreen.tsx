/** Friends screen: four tabs (friends, requests, sent, invited) with an add-friend sheet and settle-up. */

import { UserPlus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { InviteShareSheet } from "@/components/modals/InviteShareSheet";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Screen } from "@/components/shell/Screen";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Spinner } from "@/components/ui/Spinner";
import { useErrorToast } from "@/components/ui/ToastProvider";
import { errorMessage } from "@/lib/api/connect";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { FRIENDS_TABS, type FriendsTab } from "../../constants/friendsTabs";
import { AddFriendSheet } from "./components/AddFriendSheet/AddFriendSheet";
import { IncomingRequests } from "./components/IncomingRequests/IncomingRequests";
import { InvitedFriends } from "./components/InvitedFriends/InvitedFriends";
import { RegisteredFriends } from "./components/RegisteredFriends/RegisteredFriends";
import { SentRequests } from "./components/SentRequests/SentRequests";
import { useFriends } from "./hooks/useFriends";

/**
 * Renders the friends screen as four tabs. Friends: your overall position
 * and a searchable list where each row opens that friendship's ledger, with
 * a settle action that works whichever way the money is owed. Requests: what
 * awaits your answer. Sent: what you are waiting on. Invited: people you
 * added who have not joined.
 *
 * One list with sections grew past a screen as soon as a few requests were
 * pending; tabs keep each view short and give the pending ones a count you
 * can see without scrolling. Add, accept, decline, cancel and remind report
 * through the screen's toast layer rather than a line inside a form.
 *
 * @returns The friends screen content, with a spinner while the list loads.
 */
export function FriendsScreen() {
  const friendsState = useFriends();
  useErrorToast(friendsState.error);
  const currency = friendsState.me?.defaultCurrency ?? "USD";
  const counts: Record<FriendsTab, number> = {
    friends: friendsState.registeredFriends.length,
    requests: friendsState.incomingRequests.length,
    sent: friendsState.outgoingRequests.length,
    invited: friendsState.invitedFriends.length,
  };

  return (
    <Screen
      header={<ScreenHeader />}
      onRefresh={friendsState.refresh}
      refreshing={friendsState.isRefreshing}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Friends</Text>
        <Button
          compact
          icon={<UserPlus color={colors.white} size={16} />}
          label="Add friend"
          onPress={() => friendsState.setShowAdd(true)}
        />
      </View>

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
        <Text accessibilityRole="alert" style={styles.loadError}>
          Couldn&apos;t load your friends: {errorMessage(friendsState.friendsError)}
        </Text>
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
          {friendsState.tab === "friends" ? (
            <RegisteredFriends currency={currency} friendsState={friendsState} />
          ) : null}
          {friendsState.tab === "requests" ? <IncomingRequests friendsState={friendsState} /> : null}
          {friendsState.tab === "sent" ? <SentRequests friendsState={friendsState} /> : null}
          {friendsState.tab === "invited" ? <InvitedFriends friendsState={friendsState} /> : null}
        </>
      )}

      {friendsState.showAdd ? <AddFriendSheet friendsState={friendsState} /> : null}

      {friendsState.remindShare ? (
        <InviteShareSheet
          explainer={`This link signs ${friendsState.remindShare.personName} up and claims their invited identity, friendships and group seats included.`}
          onClose={friendsState.closeRemindShare}
          share={friendsState.remindShareToSheet}
          title="Remind them to sign up"
          token={friendsState.remindShare.token}
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
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
