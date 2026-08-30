/** Dashboard screen: balance summary, per-person balances with settle-up, group highlights, recent activity. */

import { Link, useRouter } from "expo-router";
import { Plus, UsersRound } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { PersonLink } from "@/components/people/PersonLink";
import { Screen } from "@/components/shell/Screen";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { leadingBucket, outstandingBuckets } from "@haalkhata/shared/money/balances";
import { formatMoney } from "@haalkhata/shared/money/money";
import { safeActivityPath } from "@haalkhata/shared/navigation/activityPath";
import { localDate } from "@haalkhata/shared/time/localTime";
import { getGreeting } from "@haalkhata/shared/greeting";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { groupEmoji } from "../../../groups/constants/groupTypes";
import { useDashboard } from "./hooks/useDashboard";

/**
 * Renders the dashboard: greeting header with quick actions, the three-card
 * balance summary, per-person balances with a settle-up flow, the groups
 * that most need attention, and the most recent activity entries.
 *
 * @returns The dashboard screen content (spinner while loading).
 */
export function DashboardScreen() {
  const dashboard = useDashboard();
  const router = useRouter();
  const currency = dashboard.me?.defaultCurrency ?? "USD";
  // A failed balance query (the RPC is rate-limited per account) must not
  // read as a zero balance: the cards show a dash and the reason is stated.
  const balancesFailed = Boolean(dashboard.balancesError);

  return (
    <Screen
      header={<ScreenHeader />}
      onRefresh={dashboard.refresh}
      refreshing={dashboard.isRefreshing}
    >
      {dashboard.isLoading ? (
        <Spinner label="Opening your ledger…" />
      ) : (
        <>
          <View>
            <Text style={styles.greeting}>
              {dashboard.me ? `${getGreeting()}, ${dashboard.me.name.split(" ")[0]}` : "Welcome"}
            </Text>
            <Text style={styles.greetingSub}>Here&apos;s where your ledger stands.</Text>
          </View>

          {/* Scanning a receipt is one of the ways to fill this form in, so
              it is not a second button beside it. */}
          <View style={styles.quickActions}>
            <View style={styles.quickAction}>
              <Button
                compact
                icon={<Plus color={colors.white} size={16} />}
                label="Add expense"
                onPress={() => router.push("/expenses/new")}
              />
            </View>
          </View>

          {balancesFailed ? (
            <View accessibilityRole="alert" style={styles.errorCard}>
              <Text style={styles.errorText}>
                Couldn&apos;t load your balances — {errorMessage(dashboard.balancesError)}
              </Text>
            </View>
          ) : null}

          {/* Balance summary — one set of cards per currency. Currencies are
              separate ledgers: a dollar owed and a euro owed are two facts,
              and adding them would be adding nothing to nothing. */}
          {dashboard.totals.map((total) => {
            const netCents = total.owedToYouCents - total.youOweCents;
            return (
              <View key={total.currency} style={styles.summary}>
                {dashboard.totals.length > 1 ? (
                  <Text style={styles.summaryCurrency}>{total.currency}</Text>
                ) : null}
                <View style={styles.summaryRow}>
                  <SummaryCard
                    label="You are owed"
                    tone="pos"
                    value={
                      balancesFailed ? "—" : formatMoney(total.owedToYouCents, total.currency)
                    }
                  />
                  <SummaryCard
                    label="You owe"
                    tone="neg"
                    value={balancesFailed ? "—" : formatMoney(total.youOweCents, total.currency)}
                  />
                </View>
                <SummaryCard
                  label="Net balance"
                  strong
                  tone={netCents >= 0 ? "pos" : "neg"}
                  value={
                    balancesFailed
                      ? "—"
                      : `${netCents < 0 ? "−" : ""}${formatMoney(Math.abs(netCents), total.currency)}`
                  }
                />
              </View>
            );
          })}

          {/* Per-person balances */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>People</Text>
            {balancesFailed ? null : dashboard.balances &&
              dashboard.balances.counterparties.length > 0 ? (
              <View style={styles.listCard}>
                {dashboard.balances.counterparties.map((counterparty, index) => {
                  if (!counterparty.user) return null;
                  const person = counterparty.user;
                  // One line per currency. A server predating `balances`
                  // sends only the default-currency scalar, which reads the
                  // same way.
                  const buckets = outstandingBuckets(
                    counterparty.balances.length > 0
                      ? counterparty.balances
                      : [{ currency, cents: counterparty.netCents }],
                    currency,
                  );
                  const toSettle = leadingBucket(buckets.filter((bucket) => bucket.cents < 0));
                  return (
                    <View
                      key={person.id}
                      style={[styles.personRow, index > 0 ? styles.rowDivider : null]}
                    >
                      <PersonLink meId={dashboard.me?.id} style={styles.personLink} userId={person.id}>
                        <Avatar user={person} />
                        <View style={styles.personText}>
                          <Text numberOfLines={1} style={styles.personName}>
                            {person.name}
                          </Text>
                          <Text style={styles.personHint}>
                            {buckets.length === 0
                              ? "settled up"
                              : buckets.every((bucket) => bucket.cents > 0)
                                ? "owes you"
                                : buckets.every((bucket) => bucket.cents < 0)
                                  ? "you owe"
                                  : "owes you · you owe"}
                          </Text>
                        </View>
                      </PersonLink>
                      <View style={styles.personAmounts}>
                        {buckets.map((bucket) => (
                          <Money
                            cents={bucket.cents}
                            currency={bucket.currency}
                            key={bucket.currency}
                            signed
                            style={styles.personAmount}
                          />
                        ))}
                      </View>
                      {toSettle ? (
                        <Button
                          compact
                          label="Settle"
                          onPress={() =>
                            dashboard.setSettleWith({
                              user: person,
                              currency: toSettle.currency,
                              cents: toSettle.cents,
                            })
                          }
                          variant="outline"
                        />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <EmptyState
                action={
                  <Button
                    compact
                    label="Create a group"
                    onPress={() => router.push("/groups")}
                  />
                }
                hint="Add an expense with a friend or create a group to get started."
                icon={<UsersRound color={colors.inkSoft} size={32} />}
                title="No balances yet"
              />
            )}
          </View>

          {/* Groups — the other half of "who do I owe": People answers it per
              person, this answers it per shared pot. Compact rows rather than
              the cards the groups screen uses, because here it sits between
              two other lists and has to read as a peer of them. */}
          {dashboard.topGroups.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Groups</Text>
                {dashboard.groups.length > dashboard.topGroups.length ? (
                  <Link href="/groups" style={styles.sectionLink}>
                    See all {dashboard.groups.length}
                  </Link>
                ) : null}
              </View>
              <View style={styles.listCard}>
                {dashboard.topGroups.map((summary, index) =>
                  summary.group ? (
                    <Pressable
                      key={summary.group.id}
                      onPress={() => router.push(`/groups/${summary.group?.id}`)}
                      style={({ pressed }) => [
                        styles.groupRow,
                        index > 0 ? styles.rowDivider : null,
                        pressed ? styles.groupRowPressed : null,
                      ]}
                    >
                      <Text style={styles.groupEmoji}>{groupEmoji(summary.group.type)}</Text>
                      <View style={styles.personText}>
                        <Text numberOfLines={1} style={styles.personName}>
                          {summary.group.name}
                        </Text>
                        <Text style={styles.personHint}>
                          {summary.memberCount} member{summary.memberCount === 1 ? "" : "s"}
                          {summary.yourNetCents === 0
                            ? " · settled up"
                            : summary.yourNetCents > 0
                              ? " · owed to you"
                              : " · you owe"}
                        </Text>
                      </View>
                      {/* The group's own currency, not yours — a group settles
                          in one currency and showing your default here would
                          label the number with money it was never counted in. */}
                      {summary.yourNetCents === 0 ? null : (
                        <Money
                          cents={summary.yourNetCents}
                          currency={summary.group.currency}
                          signed
                          style={styles.personAmount}
                        />
                      )}
                    </Pressable>
                  ) : null,
                )}
              </View>
            </View>
          ) : null}

          {/* Recent activity */}
          {dashboard.recentActivity.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent activity</Text>
                <Link href="/activity" style={styles.sectionLink}>
                  See all
                </Link>
              </View>
              <View style={styles.activityList}>
                {dashboard.recentActivity.map((event) => (
                  <Pressable
                    key={event.id}
                    onPress={() => router.push(safeActivityPath(event.link))}
                    style={styles.activityRow}
                  >
                    {event.actor ? <Avatar size="sm" user={event.actor} /> : null}
                    <Text numberOfLines={1} style={styles.activityMessage}>
                      {event.message}
                    </Text>
                    <Text style={styles.activityDate}>{localDate(event.createdAt)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}

      {dashboard.settleWith ? (
        <SettleUpModal
          currency={dashboard.settleWith.currency}
          onClose={() => dashboard.setSettleWith(null)}
          received={dashboard.settleWith.cents > 0}
          suggestedCents={Math.abs(dashboard.settleWith.cents)}
          to={dashboard.settleWith.user}
        />
      ) : null}
    </Screen>
  );
}

/**
 * Renders one balance-summary stat card with a label and a formatted amount.
 *
 * @param props - Component props.
 * @returns A single summary card.
 */
function SummaryCard({
  label,
  value,
  tone,
  strong = false,
}: {
  /** Caption shown above the amount (e.g. "You are owed"). */
  label: string;
  /** Pre-formatted money string to display. */
  value: string;
  /** Color treatment: "pos" for money owed to you, "neg" for money you owe. */
  tone: "pos" | "neg";
  /** When true, tints the card background to emphasize it (used for net balance). */
  strong?: boolean;
}) {
  return (
    <View
      style={[
        styles.summaryCard,
        strong ? (tone === "pos" ? styles.summaryCardPos : styles.summaryCardNeg) : null,
      ]}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          { color: tone === "pos" ? colors.pos600 : colors.neg600 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  activityDate: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  activityList: {
    gap: spacing.sm,
  },
  activityMessage: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
  },
  activityRow: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorCard: {
    backgroundColor: colors.neg50,
    borderColor: colors.neg600,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorText: {
    color: colors.neg700,
    fontSize: 14,
    fontWeight: "500",
  },
  groupEmoji: {
    fontSize: 22,
  },
  groupRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  groupRowPressed: {
    backgroundColor: colors.paper,
  },
  greeting: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "700",
  },
  greetingSub: {
    color: colors.inkSoft,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  listCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  personAmounts: {
    alignItems: "flex-end",
  },
  personAmount: {
    fontSize: 15,
    fontWeight: "600",
  },
  personHint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  personLink: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minWidth: 0,
  },
  personName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "500",
  },
  personRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  personText: {
    flex: 1,
    minWidth: 0,
  },
  quickAction: {
    flex: 1,
  },
  quickActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionLink: {
    color: colors.brand600,
    fontSize: 14,
    fontWeight: "500",
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: "600",
  },
  summary: {
    gap: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    padding: spacing.lg,
  },
  summaryCardNeg: {
    backgroundColor: colors.neg50,
  },
  summaryCardPos: {
    backgroundColor: colors.pos50,
  },
  summaryLabel: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  summaryCurrency: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryValue: {
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    marginTop: spacing.xs,
  },
});
