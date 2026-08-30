/** Friend detail: net balance, settle either way, and the full shared ledger with a running balance. */

import { useRouter } from "expo-router";
import { Bell, Check, HandCoins, Plus, UserPlus, Wallet } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { DetailHeader } from "@/components/shell/DetailHeader";
import { Screen } from "@/components/shell/Screen";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { outstandingBuckets } from "@haalkhata/shared/money/balances";
import { formatMoney } from "@haalkhata/shared/money/money";
import { localDate } from "@haalkhata/shared/time/localTime";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { groupEmoji } from "../../../groups/constants/groupTypes";
import { useFriendLedger } from "./hooks/useFriendLedger";

/**
 * Renders everything about one friendship: who owes whom right now, the
 * actions that change it, the per-group breakdown when the balance is spread
 * across groups, and the full history as a statement — every expense and
 * payment, what each did to the balance, and the balance after it.
 *
 * The running balance is the point: a total nobody can check line by line is
 * a number people argue about.
 *
 * @param props - Component props.
 * @returns The friend detail screen content.
 */
export function FriendDetailScreen({
  friendId,
}: {
  /** User id of the friend whose ledger is shown. */
  friendId: string;
}) {
  const view = useFriendLedger(friendId);
  const router = useRouter();

  if (view.isLoading) {
    return (
      <Screen header={<DetailHeader title="Friend" />}>
        <Spinner label="Loading…" />
      </Screen>
    );
  }
  if (view.error || !view.ledger?.friend) {
    return (
      <Screen header={<DetailHeader title="Friend" />}>
        <View style={styles.notFoundCard}>
          <Text style={styles.notFoundText}>
            {view.error ? errorMessage(view.error) : "That person could not be found."}
          </Text>
          <Button
            compact
            label="Back to friends"
            onPress={() => router.replace("/friends")}
            variant="outline"
          />
        </View>
      </Screen>
    );
  }

  // Defaults guard against a cached response from before these fields
  // existed: the query renders its cache first, and an object built by the
  // old generated class simply lacks the properties — undefined, not empty.
  const {
    friend,
    netCents,
    currency,
    entries,
    groupBalances,
    isFriend = true,
    mutualGroups = [],
  } = view.ledger;
  // One net per currency, never a sum: a server predating `nets` sends only
  // the default-currency scalar, which reads the same way as one bucket.
  const nets = outstandingBuckets(
    view.ledger.nets?.length ? view.ledger.nets : [{ currency, cents: netCents }],
    currency,
  );
  const isSettled = nets.length === 0;
  const owedToYou = nets.filter((bucket) => bucket.cents > 0);
  const owedByYou = nets.filter((bucket) => bucket.cents < 0);
  const firstName = friend.name.split(" ")[0];

  return (
    <Screen
      header={<DetailHeader title={friend.name} />}
      onRefresh={view.refresh}
      refreshing={view.isRefreshing}
    >
      <View style={styles.headerCard}>
        <View style={styles.identityRow}>
          <Avatar size="lg" user={friend} />
          <View style={styles.identityText}>
            <Text numberOfLines={1} style={styles.name}>
              {friend.name}
            </Text>
            {/* Their email and phone are private — the server sends them
                empty for anyone but yourself — so the only thing worth a line
                here is whether they have signed in yet. */}
            {!friend.registered ? (
              <Text style={styles.invited}>Invited — hasn&apos;t signed in yet</Text>
            ) : null}
          </View>
        </View>

        {/* Where you know each other from — every shared group, settled ones
            included, each a link. And when this screen is showing a pair
            rather than a friendship (any name anywhere opens it), the way to
            make it one is a tap, not a form. */}
        {mutualGroups.length > 0 || !isFriend ? (
          <View style={styles.pills}>
            {mutualGroups.map((mutual) => (
              <Pressable
                key={mutual.groupId}
                onPress={() => router.push(`/groups/${mutual.groupId}`)}
                style={styles.groupPill}
              >
                <Text style={styles.groupPillText}>
                  {groupEmoji(mutual.groupType)} {mutual.groupName}
                </Text>
              </Pressable>
            ))}
            {!isFriend ? (
              <Button
                busy={view.isAddingFriend}
                compact
                disabled={view.friendRequestSent}
                icon={<UserPlus color={colors.white} size={14} />}
                label={view.friendRequestSent ? "Requested" : "Request friendship"}
                onPress={view.addFriend}
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.balanceBlock}>
          {isSettled ? (
            <View style={styles.settledRow}>
              <Check color={colors.pos700} size={20} />
              <Text style={styles.settledText}>All settled up</Text>
            </View>
          ) : (
            // One line per currency: a dollar owed and a euro owed are two
            // facts, and no arithmetic turns them into one.
            nets.map((bucket) => (
              <View key={bucket.currency} style={styles.balanceLine}>
                <Text style={styles.balanceLabel}>
                  {bucket.cents > 0 ? `${firstName} owes you` : "you owe"}
                </Text>
                <Money
                  cents={Math.abs(bucket.cents)}
                  currency={bucket.currency}
                  style={[
                    styles.balanceAmount,
                    bucket.cents > 0 ? styles.balancePos : styles.balanceNeg,
                  ]}
                />
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          compact
          icon={<Plus color={colors.white} size={16} />}
          label="Add expense"
          onPress={() => router.push(`/expenses/new?friend=${friend.id}`)}
        />
        {/* Both directions are always offered: the balance tells you which one
            you probably want, but recording the other is never blocked. Each
            opens on its currency; the sheet can switch. */}
        {owedByYou.length > 0 ? (
          <Button
            compact
            icon={<Wallet color={colors.white} size={16} />}
            label={`I paid ${firstName}`}
            onPress={() => view.openSettle("paid", owedByYou[0].currency)}
            variant="positive"
          />
        ) : null}
        {owedToYou.length > 0 ? (
          <>
            <Button
              compact
              icon={<HandCoins color={colors.white} size={16} />}
              label={`${firstName} paid me`}
              onPress={() => view.openSettle("received", owedToYou[0].currency)}
              variant="positive"
            />
            <Button
              busy={view.isReminding}
              compact
              icon={<Bell color={colors.inkSoft} size={16} />}
              label="Send a reminder"
              onPress={view.sendReminder}
              variant="outline"
            />
          </>
        ) : null}
      </View>

      {view.reminderNote ? <Text style={styles.note}>{view.reminderNote}</Text> : null}

      {groupBalances.length > 1 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WHERE THE BALANCE SITS</Text>
          <View style={styles.listCard}>
            {groupBalances.map((balance, index) => (
              <View
                key={`${balance.groupId || "one-off"}-${balance.currency}`}
                style={[styles.row, index > 0 ? styles.rowDivider : null]}
              >
                {balance.groupId ? (
                  <Pressable
                    onPress={() => router.push(`/groups/${balance.groupId}`)}
                    style={styles.rowText}
                  >
                    <Text numberOfLines={1} style={styles.rowName}>
                      {balance.groupName || "Group"}
                    </Text>
                  </Pressable>
                ) : (
                  <Text numberOfLines={1} style={[styles.rowName, styles.rowNameSoft]}>
                    One-off expenses
                  </Text>
                )}
                {/* A rerouted number needs its label: in a simplified group
                    what you pay — and whom — is the group's shortest route,
                    not necessarily who you shared the expense with. */}
                {balance.simplified ? (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>simplified</Text>
                  </View>
                ) : null}
                <Money
                  cents={balance.netCents}
                  currency={balance.currency || currency}
                  signed
                  style={styles.rowAmount}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>HISTORY</Text>

        {entries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Check color={colors.pos600} size={32} />
            <Text style={styles.emptyTitle}>Nothing shared yet</Text>
            <Text style={styles.emptyHint}>
              Add an expense with {firstName} and it will show up here.
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {entries.map((entry, index) => {
              const isSettlement = entry.kind === "settlement";
              const removing = view.removingSettlementId === entry.id;
              return (
                <View
                  key={`${entry.kind}-${entry.id}`}
                  style={[styles.entry, index > 0 ? styles.rowDivider : null]}
                >
                  <View style={styles.entryTop}>
                    {/* A settlement is a moment, shown in the viewer's own
                        timezone; an expense's date is the calendar day the
                        user picked, which has no timezone to convert. */}
                    <Text style={styles.entryDate}>
                      {entry.createdAt ? localDate(entry.createdAt) : entry.date}
                    </Text>
                    {entry.groupName ? (
                      <View style={styles.pill}>
                        <Text numberOfLines={1} style={styles.pillText}>
                          {entry.groupName}
                        </Text>
                      </View>
                    ) : null}
                    {/* Struck through but kept: a deleted expense or a
                        removed payment no longer moves the balance, and the
                        row is what explains why the balance leans the way it
                        does now. */}
                    {entry.deleted ? (
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{isSettlement ? "removed" : "deleted"}</Text>
                      </View>
                    ) : null}
                    {/* A payment is a claim one of the two of you typed in;
                        the statement says which, on every line. */}
                    {entry.recordedByName ? (
                      <View style={styles.pill}>
                        <Text numberOfLines={1} style={styles.pillText}>
                          recorded by {entry.recordedByName}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {entry.kind === "expense" ? (
                    <Pressable onPress={() => router.push(`/expenses/${entry.id}`)}>
                      <Text
                        numberOfLines={2}
                        style={[styles.entryTitle, entry.deleted ? styles.entryTitleDeleted : null]}
                      >
                        {entry.description}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.entryTitle,
                        entry.deleted ? styles.entryTitleDeleted : styles.entryTitleSettlement,
                      ]}
                    >
                      {entry.description}
                    </Text>
                  )}

                  <View style={styles.entryFigures}>
                    <View style={styles.figure}>
                      <Text style={styles.figureLabel}>Total</Text>
                      <Text style={styles.figureValue}>
                        {formatMoney(entry.totalCents, entry.currency || currency)}
                      </Text>
                    </View>
                    {/* The signed column is the one that matters: the expense
                        total is context, your share of it is the movement. */}
                    <View style={styles.figure}>
                      <Text style={styles.figureLabel}>Change</Text>
                      <Text
                        style={[
                          styles.figureValue,
                          styles.figureStrong,
                          entry.deleted
                            ? styles.figureMuted
                            : entry.deltaCents > 0
                              ? styles.figurePos
                              : styles.figureNeg,
                        ]}
                      >
                        {entry.deleted
                          ? "—"
                          : `${entry.deltaCents > 0 ? "+" : "−"}${formatMoney(Math.abs(entry.deltaCents), entry.currency || currency)}`}
                      </Text>
                    </View>
                    {/* The running balance is per currency: a euro line
                        continues the euro column, not the dollar one. */}
                    <View style={[styles.figure, styles.figureEnd]}>
                      <Text style={styles.figureLabel}>Balance</Text>
                      <Text style={styles.figureValue}>
                        {formatMoney(Math.abs(entry.balanceAfterCents), entry.currency || currency)}
                        <Text style={styles.figureSuffix}>
                          {" "}
                          {entry.balanceAfterCents === 0
                            ? "even"
                            : entry.balanceAfterCents > 0
                              ? "to you"
                              : "to them"}
                        </Text>
                      </Text>
                    </View>
                  </View>

                  {/* A mistyped payment is the reason this exists. Two taps:
                      the first arms the button, the second sends. */}
                  {isSettlement && !entry.deleted ? (
                    <View style={styles.entryAction}>
                      <Button
                        busy={removing}
                        compact
                        label={
                          view.confirmingSettlementId === entry.id ? "Tap again to remove" : "Remove"
                        }
                        onPress={() => view.removeSettlement(entry.id)}
                        variant="outline"
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        {entries.length > 0 ? (
          <Text style={styles.footnote}>
            &ldquo;Change&rdquo; is what each line did to your balance; positive means it went in
            your favour.{" "}
            {groupBalances.some((balance) => balance.simplified)
              ? "Groups marked “simplified” reroute debts across the whole group, so the balance up top can differ from this history's running total — the history is what you shared, the headline is what actually needs to move."
              : "The top row's balance is where you stand now."}
          </Text>
        ) : null}
      </View>

      {view.settling ? (
        <SettleUpModal
          currency={view.settling.currency}
          onClose={view.closeSettle}
          received={view.settling.direction === "received"}
          suggestedCents={Math.abs(
            nets.find((bucket) => bucket.currency === view.settling?.currency)?.cents ?? 0,
          )}
          to={friend}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  balanceAmount: {
    fontSize: 30,
    fontWeight: "700",
  },
  balanceBlock: {
    alignItems: "flex-end",
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: spacing.md,
  },
  balanceLine: {
    alignItems: "flex-end",
  },
  balanceLabel: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  balanceNeg: {
    color: colors.neg600,
  },
  balancePos: {
    color: colors.pos700,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  emptyHint: {
    color: colors.inkSoft,
    fontSize: 14,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  entry: {
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  entryAction: {
    alignItems: "flex-start",
    marginTop: spacing.xs,
  },
  entryDate: {
    color: colors.inkSoft,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  entryFigures: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  entryTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "500",
  },
  entryTitleDeleted: {
    color: colors.inkSoft,
    textDecorationLine: "line-through",
  },
  entryTitleSettlement: {
    color: colors.pos700,
  },
  entryTop: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  figure: {
    gap: 2,
  },
  figureEnd: {
    alignItems: "flex-end",
    flex: 1,
  },
  figureLabel: {
    color: colors.inkSoft,
    fontSize: 11,
  },
  figureMuted: {
    color: colors.inkSoft,
  },
  figureNeg: {
    color: colors.neg600,
  },
  figurePos: {
    color: colors.pos700,
  },
  figureStrong: {
    fontWeight: "600",
  },
  figureSuffix: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "400",
  },
  figureValue: {
    color: colors.ink,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  footnote: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  groupPill: {
    backgroundColor: colors.brand50,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.xs,
  },
  groupPillText: {
    color: colors.brand700,
    fontSize: 12,
    fontWeight: "500",
  },
  headerCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  identityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  invited: {
    color: colors.inkSoft,
    fontSize: 13,
    marginTop: 2,
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
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: "700",
  },
  note: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: "500",
  },
  notFoundCard: {
    alignItems: "flex-start",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl,
  },
  notFoundText: {
    color: colors.inkSoft,
    fontSize: 15,
  },
  pill: {
    backgroundColor: colors.paper,
    borderRadius: radii.full,
    maxWidth: 160,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pills: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pillText: {
    color: colors.inkSoft,
    fontSize: 11,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
  },
  rowNameSoft: {
    color: colors.inkSoft,
    flex: 1,
    fontWeight: "400",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
  settledRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs + 2,
  },
  settledText: {
    color: colors.pos700,
    fontSize: 17,
    fontWeight: "600",
  },
});
