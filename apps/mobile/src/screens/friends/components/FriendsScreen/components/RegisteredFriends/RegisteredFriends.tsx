/** The "Friends" tab: your overall position and the searchable list of people who can carry a balance. */

import { useRouter } from "expo-router";
import { ChevronRight, Plus, Users } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PersonLink } from "@/components/people/PersonLink";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { SearchField } from "@/components/ui/SearchField";
import { leadingBucket } from "@haalkhata/shared/money/balances";
import { formatMoney } from "@haalkhata/shared/money/money";
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
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>
              You are owed{totals.length > 1 ? ` · ${total.currency}` : ""}
            </Text>
            <Text style={[styles.totalAmount, styles.totalPos]}>
              {formatMoney(total.owedToYouCents, total.currency)}
            </Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>
              You owe{totals.length > 1 ? ` · ${total.currency}` : ""}
            </Text>
            <Text style={[styles.totalAmount, styles.totalNeg]}>
              {formatMoney(total.youOweCents, total.currency)}
            </Text>
          </View>
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
            return (
              <View key={person.id} style={[styles.row, index > 0 ? styles.rowDivider : null]}>
                <PersonLink meId={friendsState.me?.id} style={styles.rowLink} userId={person.id}>
                  <Avatar user={person} />
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.name}>
                      {person.name}
                    </Text>
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
    height: 32,
    justifyContent: "center",
    width: 32,
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
    flex: 1,
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
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
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
});
