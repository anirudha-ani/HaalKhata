/** A bill open to the whole table: who is here, every line to claim, and what it comes to. */

import { useRouter } from "expo-router";
import { Check, Radio, Share2 } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { LIVE_SPLIT_CLOSED_MESSAGE } from "@haalkhata/shared/expense/live/live.constants";
import { formatMoney } from "@haalkhata/shared/money/money";
import { InviteShareSheet } from "@/components/modals/InviteShareSheet";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { DetailHeader } from "@/components/shell/DetailHeader/DetailHeader";
import { Screen } from "@/components/shell/Screen/Screen";
import { AvatarStack } from "@/components/ui/AvatarStack/AvatarStack";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Text } from "@/components/ui/Text";
import { shareLiveSplit } from "@/lib/invite/share";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { PEOPLE_AVATAR_SLOTS } from "../../constants/liveSplit";
import { AddLineForm } from "./components/AddLineForm/AddLineForm";
import { LiveExtras } from "./components/LiveExtras/LiveExtras";
import { LiveLine } from "./components/LiveLine/LiveLine";
import { LiveTotals } from "./components/LiveTotals/LiveTotals";
import { useLiveSplit } from "./hooks/useLiveSplit";

/**
 * Renders a live split. Everything on it updates by itself within a few
 * seconds of anyone changing it; when it ends the screen stays as the final
 * bill, with the way to settle it.
 *
 * @param props - Component props.
 * @returns The screen.
 */
export function LiveSplitScreen({
  expenseId,
}: {
  /** The expense, from the route. */
  expenseId: string;
}) {
  const live = useLiveSplit(expenseId);
  const router = useRouter();
  const { expense, state, liveSplit, summary } = live;
  const header = <DetailHeader title={expense?.description ?? "Live split"} />;

  if (live.isLoading) {
    return (
      <Screen header={header}>
        <Spinner label="Loading the bill…" />
      </Screen>
    );
  }
  if (live.accessEnded) {
    return (
      <Screen header={header}>
        <Text style={styles.closed}>{LIVE_SPLIT_CLOSED_MESSAGE}</Text>
        <Button label="Back to Home" onPress={() => router.replace("/dashboard")} variant="outline" />
      </Screen>
    );
  }
  if (!expense || !state) {
    return (
      <Screen header={header}>
        {live.readError ? <ErrorState error={live.readError} retry={live.reload} /> : null}
      </Screen>
    );
  }

  const payer = live.people.get(summary?.payerId ?? "");
  const present = live.castIds.flatMap((userId) => {
    const person = live.people.get(userId);
    return person ? [person] : [];
  });

  return (
    <Screen error={live.error} header={header}>
      <View style={styles.card}>
        <View style={styles.headline}>
          <Text style={styles.total}>{formatMoney(state.amountCents, expense.currency)}</Text>
          {live.isOpen ? (
            <View style={styles.liveBadge}>
              <Radio color={colors.brand700} size={14} />
              <Text style={styles.liveBadgeText}>Live · {live.timeLeft}</Text>
            </View>
          ) : (
            <View style={styles.doneBadge}>
              <Check color={colors.pos700} size={14} />
              <Text style={styles.doneBadgeText}>Finished</Text>
            </View>
          )}
        </View>
        <View style={styles.peopleRow}>
          <AvatarStack slots={PEOPLE_AVATAR_SLOTS} users={present} />
          <Text style={styles.peopleText}>
            {present.length} {present.length === 1 ? "person" : "people"} here
          </Text>
        </View>
        {live.isOpen ? (
          <View style={styles.actions}>
            {liveSplit?.token ? (
              <View style={styles.action}>
                <Button
                  compact
                  icon={<Share2 color={colors.white} size={14} />}
                  label="Invite"
                  onPress={() => live.setSharing(true)}
                />
              </View>
            ) : null}
            {live.isHost ? (
              <View style={styles.action}>
                <Button busy={live.isFinishing} compact label="Finish now" onPress={live.finish} variant="outline" />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <LiveTotals live={live} />

      <View style={styles.lines}>
        {state.lines.map((line, position) => (
          <View key={line.id || `new-${position}`} style={position > 0 ? styles.divider : null}>
            <LiveLine line={line} live={live} />
          </View>
        ))}
      </View>

      {live.isOpen ? <AddLineForm live={live} /> : null}
      <LiveExtras live={live} />

      <Button label="Open the expense" onPress={() => router.push(`/expenses/${expense.id}`)} variant="ghost" />

      {live.sharing && liveSplit ? (
        <InviteShareSheet
          explainer="Anyone with this link can join, claim what they had and change the bill until it ends."
          onClose={() => live.setSharing(false)}
          share={() => shareLiveSplit(liveSplit.token, live.myName, expense.description)}
          title="Invite the table"
          token={liveSplit.token}
        />
      ) : null}
      {live.settling && payer ? (
        <SettleUpModal
          currency={expense.currency}
          onClose={live.closeSettle}
          scopeId={expense.groupId}
          suggestedCents={summary?.myShareCents ?? 0}
          to={payer}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  closed: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  divider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  doneBadge: {
    alignItems: "center",
    backgroundColor: colors.pos50,
    borderRadius: radii.lg,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  doneBadgeText: {
    color: colors.pos700,
    fontSize: 13,
    fontWeight: "600",
  },
  headline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  lines: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  liveBadge: {
    alignItems: "center",
    backgroundColor: colors.brand50,
    borderRadius: radii.lg,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  liveBadgeText: {
    color: colors.brand700,
    fontSize: 13,
    fontWeight: "600",
  },
  peopleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  peopleText: {
    color: colors.inkSoft,
    fontSize: 14,
  },
  total: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "700",
  },
});
