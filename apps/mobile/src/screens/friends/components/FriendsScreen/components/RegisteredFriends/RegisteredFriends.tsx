/** The "Friends" tab: your overall position and the searchable list of people who can carry a balance. */

import { useRouter } from "expo-router";
import { ChevronRight, Plus, Users } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { PersonLink } from "@/components/people/PersonLink";
import { Avatar } from "@/components/ui/Avatar";
import { BalanceSummaryCard } from "@/components/ui/BalanceSummaryCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { SearchField } from "@/components/ui/SearchField";
import { leadingBucket, positionCaption } from "@haalkhata/shared/money/balances";
import { formatMoney } from "@haalkhata/shared/money/money";
import { useResponsiveLayout } from "@/lib/layout/hooks/useResponsiveLayout";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { bucketsOf, type FriendsController } from "../../hooks/useFriends";

/**
 * Renders the Friends tab: one pair of totals per currency (a dollar owed
 * and a euro owed are two facts, never one number), a search box, and a
 * list where each row opens that friendship's ledger, with a one-off expense
 * shortcut and a settle action that works whichever way the money is owed.
 *
 * @param props - Component props.
 * @returns The tab content, or an empty state with an add action.
 */
export function RegisteredFriends({
  friendsState,
  currency,
}: {
  /** The friends-screen controller from useFriends. */
  friendsState: FriendsController;
  /** The signed-in user's default currency, for zero totals. */
  currency: string;
}) {
  const router = useRouter();
  const { isLargeText, isTablet } = useResponsiveLayout();
  if (friendsState.registeredFriends.length === 0) {
    return (
      <EmptyState
        action={<Button compact label="Add friend" onPress={() => friendsState.setShowAdd(true)} />}
        hint="Send a request by email or phone; they’ll appear here after accepting."
        icon={<Users color={colors.inkSoft} size={32} />}
        title="No friends yet"
      />
    );
  }
  const totals =
    friendsState.totals.length > 0
      ? friendsState.totals
      : [{ currency, owedToYouCents: 0, youOweCents: 0 }];
  return (
    <View style={styles.container}>
      {totals.map((total) => (
        <View key={total.currency} style={styles.totals}>
          <BalanceSummaryCard
            label={`You are owed${totals.length > 1 ? ` · ${total.currency}` : ""}`}
            tone="pos"
            value={formatMoney(total.owedToYouCents, total.currency)}
          />
          <BalanceSummaryCard
            label={`You owe${totals.length > 1 ? ` · ${total.currency}` : ""}`}
            tone="neg"
            value={formatMoney(total.youOweCents, total.currency)}
          />
        </View>
      ))}

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
            {friendsState.visibleFriends.length} of {friendsState.registeredFriends.length}
          </Text>
        ) : null}
      </View>

      {friendsState.visibleFriends.length === 0 ? (
        <View style={styles.noMatchCard}>
          <Text style={styles.noMatchText}>No friends match “{friendsState.query}”.</Text>
        </View>
      ) : (
        <View style={styles.listCard}>
          {friendsState.visibleFriends.map((friend, index) => {
            if (!friend.user) return null;
            const person = friend.user;
            const buckets = bucketsOf(friend, currency);
            const lead = leadingBucket(buckets);
            const amounts = (
              <View style={[styles.amounts, !isTablet || isLargeText ? styles.amountsStacked : null]}>
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
            );
            return (
              <View key={person.id} style={[styles.row, index > 0 ? styles.rowDivider : null]}>
                <PersonLink meId={friendsState.me?.id} style={[styles.rowLink, isLargeText ? styles.rowLinkWrapped : null]} userId={person.id}>
                  <Avatar user={person} />
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.name}>
                      {person.name}
                    </Text>
                    <Text style={styles.balanceHint}>
                      {positionCaption(buckets)}
                    </Text>
                    {!isTablet || isLargeText ? amounts : null}
                  </View>
                  {isTablet && !isLargeText ? amounts : null}
                  <ChevronRight color={colors.inkSoft} size={16} />
                </PersonLink>
                <View style={styles.rowActions}>
                  <Pressable
                    accessibilityLabel={`Add a one-off expense with ${person.name}`}
                    onPress={() => router.push(`/expenses/new?friend=${person.id}`)}
                    style={styles.iconAction}
                  >
                    <Plus color={colors.inkSoft} size={16} />
                  </Pressable>
                  {/* Settling is offered whichever way the debt runs: being
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
  );
}

const styles = StyleSheet.create({
  amount: {
    fontSize: 14,
    fontWeight: "600",
  },
  amounts: {
    alignItems: "flex-end",
  },
  amountsStacked: {
    alignItems: "flex-start",
    width: "100%",
  },
  rowLinkWrapped: {
    width: "100%",
    flexBasis: "auto",
    flexShrink: 0,
  },
  balanceHint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  container: {
    gap: spacing.md,
  },
  iconAction: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
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
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowLink: {
    alignItems: "center",
    flexBasis: 0,
    maxWidth: "100%",
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    gap: spacing.md,
    minWidth: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  searchCount: {
    color: colors.inkSoft,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  searchField: {
    flex: 1,
    minWidth: 0,
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  totals: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
});
