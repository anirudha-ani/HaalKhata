/** Group balances view: net positions plus pairwise/simplified debts with settle actions. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { BalancesResponse } from "@haalkhata/protogen/expense/v1/expense_pb";
import { ArrowRight, Wand2 } from "lucide-react-native";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the balances tab of a group: every member's net position, then the
 * list of who-owes-whom debts (pairwise or simplified) with an action on every
 * debt the viewer is part of: settle what they owe, record what they are owed.
 *
 * @returns The two balance sections, or null until balances have loaded.
 */
export function BalancesPanel({
  balances,
  currency,
  meId,
  userById,
  simplified,
  simplifyPending = false,
  onToggleSimplified,
  onSettle,
}: {
  /** Balances response for the group; the panel renders nothing until it loads. */
  balances: BalancesResponse | undefined;
  /** Currency code all amounts are shown in (the group's currency). */
  currency: string;
  /** The signed-in user's id, used to label rows as "You" and show settle buttons. */
  meId: string | undefined;
  /** Lookup from user id to User for rendering names and avatars. */
  userById: Map<string, User>;
  /** The group's persisted simplify-debts mode; decides which debt list is live. */
  simplified: boolean;
  /** True while a toggle of the mode is in flight; ignores taps meanwhile. */
  simplifyPending?: boolean;
  /** Called with the desired state when the simplify-debts toggle is pressed. */
  onToggleSimplified: (value: boolean) => void;
  /**
   * Called when the viewer taps the action on a debt, with the other party,
   * the amount, and whether this records money *received* rather than paid.
   */
  onSettle: (user: User, cents: number, received: boolean) => void;
}) {
  if (!balances) return null;
  const debts = simplified ? balances.simplified : balances.debts;
  // Pairwise debts that survive while every net is zero can only be a loop —
  // typically left behind by payments recorded while debts were simplified.
  // Money-wise nobody owes anybody; without a word of explanation the list
  // looks like outstanding debt, so it gets one.
  const cancelingLoop =
    !simplified &&
    debts.length > 0 &&
    balances.nets.every((position) => position.netCents === 0);

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NET POSITIONS</Text>
        <View style={styles.listCard}>
          {balances.nets.map((netPosition, index) => {
            const user = userById.get(netPosition.userId);
            if (!user) return null;
            return (
              <View
                key={netPosition.userId}
                style={[styles.row, index > 0 ? styles.rowDivider : null]}
              >
                <Avatar size="sm" user={user} />
                <Text numberOfLines={1} style={styles.rowName}>
                  {user.id === meId ? "You" : user.name}
                </Text>
                {netPosition.netCents === 0 ? (
                  <Text style={styles.rowHint}>settled up</Text>
                ) : (
                  <>
                    <Text style={styles.rowHint}>
                      {netPosition.netCents > 0 ? "gets back" : "owes"}
                    </Text>
                    <Money
                      cents={netPosition.netCents}
                      currency={currency}
                      signed
                      style={styles.rowAmount}
                    />
                  </>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {/* The mode gets a real switch with its state written out, not a
            chip that reads as "maybe on?". It decides which debts exist —
            here, on friend pages, on the dashboard — and which payments the
            server accepts, for everyone in the group, so its state has to be
            legible at a glance and said before it is flipped, not after. */}
        <View style={[styles.modeCard, simplified ? styles.modeCardOn : null]}>
          <Wand2 color={simplified ? colors.brand600 : colors.inkSoft} size={18} />
          <View style={styles.modeText}>
            <View style={styles.modeTitleRow}>
              <Text style={styles.modeTitle}>Simplify debts</Text>
              <Text style={[styles.modeState, simplified ? styles.modeStateOn : null]}>
                {simplified ? "ON" : "OFF"}
              </Text>
            </View>
            <Text style={styles.modeHint}>
              {simplified
                ? "Debts are combined into the fewest payments. Applies to everyone in this group."
                : "Debts run person to person, exactly as shared. Turning this on combines them — for everyone in this group."}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Simplify debts"
            disabled={simplifyPending}
            onValueChange={onToggleSimplified}
            thumbColor="#ffffff"
            trackColor={{ false: colors.line, true: colors.brand600 }}
            value={simplified}
          />
        </View>

        <Text style={styles.sectionTitle}>
          {simplified ? "SIMPLIFIED PAYMENTS" : "WHO OWES WHOM"}
        </Text>

        {cancelingLoop ? (
          <View style={styles.allSettled}>
            <Text style={styles.allSettledText}>
              These debts cancel out around a loop — everyone&apos;s overall position is zero.
              Turn Simplify debts on above to clear the view.
            </Text>
          </View>
        ) : null}

        {debts.length === 0 ? (
          <View style={styles.allSettled}>
            <Text style={styles.allSettledText}>Everyone is settled up 🎉</Text>
          </View>
        ) : (
          <View style={styles.debts}>
            {debts.map((debt) => {
              const fromUser = userById.get(debt.fromUserId);
              const toUser = userById.get(debt.toUserId);
              if (!fromUser || !toUser) return null;
              const mine = debt.fromUserId === meId;
              const owedToMe = debt.toUserId === meId;
              return (
                <View key={`${debt.fromUserId}-${debt.toUserId}`} style={styles.debtRow}>
                  <Avatar size="sm" user={fromUser} />
                  <ArrowRight color={colors.inkSoft} size={16} />
                  <Avatar size="sm" user={toUser} />
                  <Text numberOfLines={1} style={styles.debtText}>
                    <Text style={styles.debtName}>{mine ? "You" : fromUser.name}</Text>
                    <Text style={styles.debtVerb}> owe{mine ? "" : "s"} </Text>
                    <Text style={styles.debtName}>
                      {debt.toUserId === meId ? "you" : toUser.name}
                    </Text>
                  </Text>
                  <Money cents={debt.amountCents} currency={currency} style={styles.rowAmount} />
                  {/* Both directions, matching the friend screen: a debt you
                      owe is one to pay, a debt owed to you is one to record
                      when it lands. Only offering the first left a group
                      where everyone owes the payer with no action anywhere on
                      the screen — the ordinary case for whoever picked up
                      the bill. */}
                  {mine || owedToMe ? (
                    <Button
                      compact
                      label={mine ? "Settle" : "Record"}
                      onPress={() => onSettle(mine ? toUser : fromUser, debt.amountCents, !mine)}
                      variant="positive"
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  allSettled: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "dashed",
    borderWidth: 1,
    padding: spacing.xl,
  },
  allSettledText: {
    color: colors.inkSoft,
    fontSize: 14,
    textAlign: "center",
  },
  container: {
    gap: spacing.xl,
  },
  debtName: {
    fontWeight: "500",
  },
  debtRow: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  debts: {
    gap: spacing.sm,
  },
  debtText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
  },
  debtVerb: {
    color: colors.inkSoft,
  },
  listCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  modeCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  modeCardOn: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
  },
  modeHint: {
    color: colors.inkSoft,
    fontSize: 12,
    marginTop: 2,
  },
  modeState: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  modeStateOn: {
    color: colors.brand700,
  },
  modeText: {
    flex: 1,
    minWidth: 0,
  },
  modeTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  modeTitleRow: {
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
  rowAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowHint: {
    color: colors.inkSoft,
    fontSize: 12,
  },
  rowName: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
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
});
