/** Friends screen UI: overall position, searchable friend list opening each ledger, add-by-email-or-phone, settle-up. */

import { useRouter } from "expo-router";
import { ChevronRight, Plus, UserPlus, Users } from "lucide-react-native";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { PersonLink } from "@/components/people/PersonLink";
import { Screen } from "@/components/shell/Screen";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { SearchField } from "@/components/ui/SearchField";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { leadingBucket } from "@haalkhata/shared/money/balances";
import { formatMoney } from "@haalkhata/shared/money/money";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { bucketsOf, useFriends } from "./hooks/useFriends";

/**
 * Renders the friends screen: your overall position (owed to you / you owe),
 * an add-friend form (email or phone), a searchable list where each row opens
 * that friendship's ledger, quick actions (one-off expense, settle whichever
 * way the money is owed), and the settle-up sheet when a friend is selected.
 *
 * Every row opens the ledger rather than being a dead readout — a balance you
 * cannot open is a number you cannot check.
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

      {/* One pair of cards per currency: a dollar owed and a euro owed are
          two facts, never one total. */}
      {friendsState.friends.length > 0
        ? (friendsState.totals.length > 0
            ? friendsState.totals
            : [{ currency, owedToYouCents: 0, youOweCents: 0 }]
          ).map((total) => (
            <View key={total.currency} style={styles.totals}>
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>
                  You are owed{friendsState.totals.length > 1 ? ` · ${total.currency}` : ""}
                </Text>
                <Text style={[styles.totalAmount, styles.totalPos]}>
                  {formatMoney(total.owedToYouCents, total.currency)}
                </Text>
              </View>
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>
                  You owe{friendsState.totals.length > 1 ? ` · ${total.currency}` : ""}
                </Text>
                <Text style={[styles.totalAmount, styles.totalNeg]}>
                  {formatMoney(total.youOweCents, total.currency)}
                </Text>
              </View>
            </View>
          ))
        : null}

      {friendsState.isLoading ? (
        <Spinner label="Loading friends…" />
      ) : friendsState.friendsError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          Couldn&apos;t load your friends — {errorMessage(friendsState.friendsError)}
        </Text>
      ) : friendsState.friends.length === 0 ? (
        <EmptyState
          hint="Send a request by email or phone; they’ll appear here after accepting."
          icon={<Users color={colors.inkSoft} size={32} />}
          title="No friends yet"
        />
      ) : (
        <View style={styles.listSection}>
          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <SearchField
                onChange={friendsState.setQuery}
                placeholder="Search friends by name"
                value={friendsState.query}
              />
            </View>
            {friendsState.query ? (
              <Text style={styles.searchCount}>
                {friendsState.visibleFriends.length} of {friendsState.friends.length}
              </Text>
            ) : null}
          </View>

          {friendsState.visibleFriends.length === 0 ? (
            <View style={styles.noMatchCard}>
              <Text style={styles.noMatchText}>
                No friends match “{friendsState.query}”.
              </Text>
            </View>
          ) : (
        <View style={styles.listCard}>
          {friendsState.visibleFriends.map((friend, index) => {
            if (!friend.user) return null;
            const person = friend.user;
            // One line per currency — a dollar owed and a euro owed are two
            // facts, never one number.
            const buckets = bucketsOf(friend, currency);
            const lead = leadingBucket(buckets);
            return (
              <View key={person.id} style={[styles.row, index > 0 ? styles.rowDivider : null]}>
                <PersonLink meId={friendsState.me?.id} style={styles.rowLink} userId={person.id}>
                  <Avatar user={person} />
                  <View style={styles.rowText}>
                    <View style={styles.nameRow}>
                      <Text numberOfLines={1} style={styles.name}>
                        {person.name}
                      </Text>
                      {!person.registered ? (
                        <View style={styles.invitedBadge}>
                          <Text style={styles.invitedBadgeText}>invited</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.balanceHint}>
                      {buckets.length === 0
                        ? "settled up"
                        : buckets.every((bucket) => bucket.cents > 0)
                          ? "owes you"
                          : buckets.every((bucket) => bucket.cents < 0)
                            ? "you owe"
                            : "owes you · you owe"}
                    </Text>
                  </View>
                  <View style={styles.amounts}>
                    {buckets.map((bucket) => (
                      <Money
                        cents={bucket.cents}
                        currency={bucket.currency}
                        key={bucket.currency}
                        signed
                        style={styles.amount}
                      />
                    ))}
                  </View>
                  <ChevronRight color={colors.inkSoft} size={16} />
                </PersonLink>
                <View style={styles.rowActions}>
                  <Pressable
                    accessibilityLabel="Add one-off expense"
                    onPress={() => router.push(`/expenses/new?friend=${person.id}`)}
                    style={styles.iconAction}
                  >
                    <Plus color={colors.inkSoft} size={16} />
                  </Pressable>
                  {/* Settling is offered whichever way the debt runs — being
                      owed money used to be a dead end with no action at all.
                      It opens on the largest balance; the sheet can switch
                      currency. */}
                  {lead ? (
                    <Button
                      compact
                      label="Settle"
                      onPress={() =>
                        friendsState.setSettleWith({
                          user: person,
                          currency: lead.currency,
                          cents: lead.cents,
                        })
                      }
                      variant="outline"
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
          )}
        </View>
      )}

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
  amounts: {
    alignItems: "flex-end",
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
  listSection: {
    gap: spacing.md,
  },
  noMatchCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  noMatchText: {
    color: colors.inkSoft,
    fontSize: 14,
    textAlign: "center",
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
  searchCount: {
    color: colors.inkSoft,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  searchField: {
    flex: 1,
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
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
  rowLink: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minWidth: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  totalAmount: {
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  totalCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    padding: spacing.lg,
  },
  totalLabel: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  totalNeg: {
    color: colors.neg600,
  },
  totalPos: {
    color: colors.pos700,
  },
  totals: {
    flexDirection: "row",
    gap: spacing.md,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "700",
  },
});
