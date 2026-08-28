/** Friends screen UI: add-by-email-or-phone form, per-friend balances, settle-up. */

import { useRouter } from "expo-router";
import { Plus, UserPlus, Users } from "lucide-react-native";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Screen } from "@/components/shell/Screen";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Spinner } from "@/components/ui/Spinner";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { useFriends } from "./hooks/useFriends";

/**
 * Renders the friends screen: an add-friend form (email or phone), the list of
 * friends with their net balances and quick actions (one-off expense,
 * settle), and the settle-up sheet when a friend is selected.
 *
 * @returns The friends screen content, with a spinner while the list loads.
 */
export function FriendsScreen() {
  const friendsState = useFriends();
  const router = useRouter();
  const currency = friendsState.me?.defaultCurrency ?? "USD";

  return (
    <Screen
      header={<ScreenHeader />}
      onRefresh={friendsState.refresh}
      refreshing={friendsState.isRefreshing}
    >
      <Text style={styles.title}>Friends</Text>

      <View>
        <View style={styles.addRow}>
          {/* email-address keyboard, not phone-pad: it carries both letters
              and digits, so one field serves either identifier. */}
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={friendsState.setIdentifier}
            placeholder="Add a friend by email or phone"
            placeholderTextColor={colors.inkSoft}
            style={styles.addInput}
            value={friendsState.identifier}
          />
          <Button
            busy={friendsState.isAdding}
            disabled={friendsState.identifier.trim() === ""}
            icon={<UserPlus color={colors.white} size={16} />}
            label="Send"
            onPress={friendsState.submitAdd}
          />
        </View>
        {friendsState.error ? <Text style={styles.error}>{friendsState.error}</Text> : null}
        {friendsState.notice ? <Text style={styles.notice}>{friendsState.notice}</Text> : null}
        <Text style={styles.hint}>
          For privacy, we won’t reveal whether that identifier has an account. They must accept
          before either of you is added as a friend.
        </Text>
      </View>

      {friendsState.incomingRequests.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Friend requests</Text>
          <View style={styles.listCard}>
            {friendsState.incomingRequests.map((requester, index) => {
              const responding = friendsState.respondingUserId === requester.id;
              return (
                <View
                  key={requester.id}
                  style={[styles.row, index > 0 ? styles.rowDivider : null]}
                >
                  <Avatar user={requester} />
                  <Text numberOfLines={1} style={styles.requestName}>
                    {requester.name}
                  </Text>
                  <View style={styles.requestActions}>
                    <Button
                      compact
                      disabled={responding}
                      label="Decline"
                      onPress={() => friendsState.respondToRequest(requester.id, false)}
                      variant="outline"
                    />
                    <Button
                      compact
                      busy={responding && friendsState.respondingAccept}
                      label="Accept"
                      onPress={() => friendsState.respondToRequest(requester.id, true)}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {friendsState.isLoading ? (
        <Spinner label="Loading friends…" />
      ) : friendsState.friends.length === 0 ? (
        <EmptyState
          hint="Send a request by email or phone; they’ll appear here after accepting."
          icon={<Users color={colors.inkSoft} size={32} />}
          title="No friends yet"
        />
      ) : (
        <View style={styles.listCard}>
          {friendsState.friends.map((friend, index) =>
            friend.user ? (
              <View
                key={friend.user.id}
                style={[styles.row, index > 0 ? styles.rowDivider : null]}
              >
                <Avatar user={friend.user} />
                <View style={styles.rowText}>
                  <View style={styles.nameRow}>
                    <Text numberOfLines={1} style={styles.name}>
                      {friend.user.name}
                    </Text>
                    {!friend.user.registered ? (
                      <View style={styles.invitedBadge}>
                        <Text style={styles.invitedBadgeText}>invited</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.balanceHint}>
                    {friend.netCents === 0
                      ? "settled up"
                      : friend.netCents > 0
                        ? "owes you"
                        : "you owe"}
                  </Text>
                </View>
                {friend.netCents !== 0 ? (
                  <Money cents={friend.netCents} currency={currency} signed style={styles.amount} />
                ) : null}
                <View style={styles.rowActions}>
                  <Pressable
                    accessibilityLabel="Add one-off expense"
                    onPress={() => router.push(`/expenses/new?friend=${friend.user?.id}`)}
                    style={styles.iconAction}
                  >
                    <Plus color={colors.inkSoft} size={16} />
                  </Pressable>
                  {friend.netCents < 0 ? (
                    <Button
                      compact
                      label="Settle"
                      onPress={() => friendsState.setSettleWith(friend)}
                      variant="outline"
                    />
                  ) : null}
                </View>
              </View>
            ) : null,
          )}
        </View>
      )}

      {friendsState.settleWith?.user ? (
        <SettleUpModal
          currency={currency}
          onClose={() => friendsState.setSettleWith(null)}
          suggestedCents={-friendsState.settleWith.netCents}
          to={friendsState.settleWith.user}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addInput: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  amount: {
    fontSize: 14,
    fontWeight: "600",
  },
  balanceHint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  error: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "500",
    marginTop: spacing.sm,
  },
  hint: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  notice: {
    color: colors.pos700,
    fontSize: 14,
    fontWeight: "500",
    marginTop: spacing.sm,
  },
  iconAction: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  invitedBadge: {
    backgroundColor: colors.paper,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  invitedBadgeText: {
    color: colors.inkSoft,
    fontSize: 10,
    fontWeight: "500",
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
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  nameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  requestActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  requestName: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "700",
  },
});
