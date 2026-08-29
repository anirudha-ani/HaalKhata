/** Dashboard screen: balance summary, per-person balances with settle-up, recent activity. */

import { Link, useRouter } from "expo-router";
import { Plus, ScanLine, UsersRound } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Screen } from "@/components/shell/Screen";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/connect";
import { formatMoney } from "@haalkhata/shared/money/money";
import { safeActivityPath } from "@haalkhata/shared/navigation/activityPath";
import { localDate } from "@haalkhata/shared/time/localTime";
import { getGreeting } from "@haalkhata/shared/greeting";
import { colors, fonts, radii, spacing } from "@/lib/theme/theme";
import { useDashboard } from "./hooks/useDashboard";

/**
 * Renders the dashboard: greeting header with quick actions, the three-card
 * balance summary, per-person balances with a settle-up flow, and the most
 * recent activity entries.
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

          <View style={styles.quickActions}>
            <View style={styles.quickAction}>
              <Button
                compact
                icon={<ScanLine color={colors.brand600} size={16} />}
                label="Scan receipt"
                onPress={() => router.push("/scan")}
                variant="outline"
              />
            </View>
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

          {/* Balance summary */}
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <SummaryCard
                label="You are owed"
                tone="pos"
                value={
                  balancesFailed
                    ? "—"
                    : formatMoney(dashboard.balances?.owedToYouCents ?? 0, currency)
                }
              />
              <SummaryCard
                label="You owe"
                tone="neg"
                value={
                  balancesFailed ? "—" : formatMoney(dashboard.balances?.youOweCents ?? 0, currency)
                }
              />
            </View>
            <SummaryCard
              label="Net balance"
              strong
              tone={dashboard.netCents >= 0 ? "pos" : "neg"}
              value={
                balancesFailed
                  ? "—"
                  : `${dashboard.netCents < 0 ? "−" : ""}${formatMoney(Math.abs(dashboard.netCents), currency)}`
              }
            />
          </View>

          {/* Per-person balances */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>People</Text>
            {balancesFailed ? null : dashboard.balances &&
              dashboard.balances.counterparties.length > 0 ? (
              <View style={styles.listCard}>
                {dashboard.balances.counterparties.map((counterparty, index) =>
                  counterparty.user ? (
                    <View
                      key={counterparty.user.id}
                      style={[styles.personRow, index > 0 ? styles.rowDivider : null]}
                    >
                      <Avatar user={counterparty.user} />
                      <View style={styles.personText}>
                        <Text numberOfLines={1} style={styles.personName}>
                          {counterparty.user.name}
                        </Text>
                        <Text style={styles.personHint}>
                          {counterparty.netCents === 0
                            ? "settled up"
                            : counterparty.netCents > 0
                              ? "owes you"
                              : "you owe"}
                        </Text>
                      </View>
                      <Money
                        cents={counterparty.netCents}
                        currency={currency}
                        signed
                        style={styles.personAmount}
                      />
                      {counterparty.netCents < 0 ? (
                        <Button
                          compact
                          label="Settle"
                          onPress={() => dashboard.setSettleWith(counterparty)}
                          variant="outline"
                        />
                      ) : null}
                    </View>
                  ) : null,
                )}
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

      {dashboard.settleWith?.user ? (
        <SettleUpModal
          currency={currency}
          onClose={() => dashboard.setSettleWith(null)}
          suggestedCents={-dashboard.settleWith.netCents}
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
  personAmount: {
    fontSize: 15,
    fontWeight: "600",
  },
  personHint: {
    color: colors.inkSoft,
    fontSize: 12,
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
