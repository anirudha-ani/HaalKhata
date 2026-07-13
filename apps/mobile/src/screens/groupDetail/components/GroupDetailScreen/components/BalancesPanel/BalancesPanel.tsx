/** Group balances view: net positions plus pairwise/simplified debts with settle actions. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { BalancesResponse } from "@haalkhata/protogen/expense/v1/expense_pb";
import { ArrowRight, Wand2 } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Money } from "@/components/ui/Money";
import { colors, radii, spacing } from "@/lib/theme/theme";

/**
 * Renders the balances tab of a group: every member's net position, then the
 * list of who-owes-whom debts (pairwise or simplified) with a settle button on
 * the debts the viewer owes.
 *
 * @returns The two balance sections, or null until balances have loaded.
 */
export function BalancesPanel({
  balances,
  currency,
  meId,
  userById,
  simplified,
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
  /** Whether the simplified (minimal-payments) debt list is shown instead of pairwise debts. */
  simplified: boolean;
  /** Called with the desired state when the simplify-debts toggle is pressed. */
  onToggleSimplified: (value: boolean) => void;
  /** Called with the creditor and amount when the viewer taps Settle on a debt. */
  onSettle: (user: User, cents: number) => void;
}) {
  if (!balances) return null;
  const debts = simplified ? balances.simplified : balances.debts;

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
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {simplified ? "SIMPLIFIED PAYMENTS" : "WHO OWES WHOM"}
          </Text>
          <Chip
            icon={<Wand2 color={simplified ? colors.brand700 : colors.inkSoft} size={13} />}
            label="Simplify debts"
            onPress={() => onToggleSimplified(!simplified)}
            selected={simplified}
          />
        </View>

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
                  {mine ? (
                    <Button
                      compact
                      label="Settle"
                      onPress={() => onSettle(toUser, debt.amountCents)}
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
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
});
