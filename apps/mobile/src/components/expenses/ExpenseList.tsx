/** Expense list rows: category, payer summary, and your lent/borrowed net per expense. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { Expense } from "@haalkhata/protogen/expense/v1/expense_pb";
import { useRouter } from "expo-router";
import { Check, ReceiptText } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { settledStatus } from "@haalkhata/shared/expense/settledStatus";
import { formatMoney } from "@haalkhata/shared/money/money";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { CATEGORY_EMOJI } from "./categoryEmoji";

/**
 * Group-agnostic expense list with a "your share" lens per row: each expense
 * opens its detail screen and shows the category emoji, who paid, and how
 * much the viewer lent or borrowed on it.
 *
 * @returns The expense rows, or an empty state when there are no expenses.
 */
export function ExpenseList({
  expenses,
  meId,
  userById,
  emptyHint,
  groupNameById,
  settledIds,
}: {
  /** Expenses to render, newest-first as returned by the server. */
  expenses: Expense[];
  /** The signed-in user's id, used to compute their lent/borrowed net per row. */
  meId: string | undefined;
  /** Lookup from user id to User for naming payers. */
  userById: Map<string, User>;
  /** Hint text for the empty state when there are no expenses. */
  emptyHint: string;
  /**
   * Group names keyed by id. When given, each row carries a pill naming which
   * group it belongs to ("one-off" when none) — for lists that mix scopes,
   * where a row's home is not implied by the screen it is on. A single
   * group's screen omits this.
   */
  groupNameById?: Map<string, string>;
  /**
   * Ids of expenses with nothing pending for the viewer (their balance in
   * the expense's scope is zero). Rows in it trade the lent/borrowed label
   * for the truthful state — "no one owes you here" / "you owe nothing
   * here" — and mute the amount into history.
   */
  settledIds?: Set<string>;
}) {
  const router = useRouter();

  if (expenses.length === 0) {
    return (
      <EmptyState
        hint={emptyHint}
        icon={<ReceiptText color={colors.inkSoft} size={32} />}
        title="No expenses yet"
      />
    );
  }

  return (
    <View style={styles.listCard}>
      {expenses.map((expense, index) => {
        // The viewer's net on this expense: what they paid minus what they owe.
        const paid = expense.payers
          .filter((payer) => payer.userId === meId)
          .reduce((totalCents, payer) => totalCents + payer.amountCents, 0);
        const owed = expense.splits
          .filter((split) => split.userId === meId)
          .reduce((totalCents, split) => totalCents + split.owedCents, 0);
        const myNet = paid - owed;
        const firstPayer = expense.payers[0]
          ? (userById.get(expense.payers[0].userId)?.name ?? "someone")
          : "someone";
        const payerLabel =
          expense.payers.length > 1
            ? `${expense.payers.length} people paid`
            : expense.payers[0]?.userId === meId
              ? "you paid"
              : `${firstPayer} paid`;
        // A deleted expense stays in the list, struck through: it no longer
        // moves any balance, but a payment made against it keeps the row
        // that explains it.
        const deleted = expense.deletedAt !== "";
        const settled = settledIds?.has(expense.id) ?? false;
        // Everyone else on the expense, for the one-off wording — group rows
        // speak of the group instead and never read this.
        const otherFirstNames = settled
          ? [
              ...new Set(
                [
                  ...expense.payers.map((payer) => payer.userId),
                  ...expense.splits.map((split) => split.userId),
                ]
                  .filter((participantId) => participantId !== meId)
                  .map((participantId) => userById.get(participantId)?.name.split(" ")[0])
                  .filter((name): name is string => Boolean(name)),
              ),
            ]
          : [];
        const status = settled
          ? settledStatus(myNet > 0, expense.groupId !== "", otherFirstNames)
          : null;

        return (
          <Pressable
            key={expense.id}
            onPress={() => router.push(`/expenses/${expense.id}`)}
            style={({ pressed }) => [
              styles.row,
              index > 0 ? styles.rowDivider : null,
              pressed ? styles.rowPressed : null,
            ]}
          >
            <Text style={styles.emoji}>{CATEGORY_EMOJI[expense.category] ?? "🧾"}</Text>
            <View style={styles.rowText}>
              <Text
                numberOfLines={1}
                style={[styles.description, deleted ? styles.descriptionDeleted : null]}
              >
                {expense.description}
              </Text>
              <View style={styles.metaRow}>
                {deleted ? (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>deleted</Text>
                  </View>
                ) : null}
                {/* The row's home as a pill, not buried in the meta text —
                    on a mixed list, where an expense lives is the first
                    thing being scanned for. */}
                {groupNameById ? (
                  <View style={[styles.pill, expense.groupId ? styles.pillGroup : null]}>
                    <Text
                      numberOfLines={1}
                      style={[styles.pillText, expense.groupId ? styles.pillGroupText : null]}
                    >
                      {expense.groupId ? (groupNameById.get(expense.groupId) ?? "group") : "one-off"}
                    </Text>
                  </View>
                ) : null}
                <Text numberOfLines={1} style={styles.meta}>
                  {expense.expenseDate} · {payerLabel}{" "}
                  {formatMoney(expense.amountCents, expense.currency)}
                  {expense.splitType === "itemized" ? " · itemized" : ""}
                </Text>
              </View>
            </View>
            <View style={styles.net}>
              {deleted ? (
                <Text style={styles.netNone}>no longer counts</Text>
              ) : myNet === 0 ? (
                <Text style={styles.netNone}>not involved / even</Text>
              ) : status ? (
                <>
                  {/* The state, not a verdict on the expense: "settled" here
                      would claim this row was paid off, which the ledger
                      never tracks — scopes reach zero, sometimes with no
                      payment at all. So the label says what is true in the
                      viewer's direction; the detail screen carries the full
                      sentence. */}
                  <View style={styles.settledRow}>
                    <Check color={colors.pos600} size={12} />
                    <Text style={styles.settledLabel}>{status.label}</Text>
                  </View>
                  {/* Unsigned on purpose: the sign colors say "money is
                      pending", and nothing is. */}
                  <Money cents={myNet} currency={expense.currency} style={styles.netMuted} />
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.netLabel,
                      { color: myNet > 0 ? colors.pos600 : colors.neg600 },
                    ]}
                  >
                    {myNet > 0 ? "you lent" : "you borrowed"}
                  </Text>
                  <Money
                    cents={myNet}
                    currency={expense.currency}
                    signed
                    style={styles.netAmount}
                  />
                </>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  description: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "500",
  },
  descriptionDeleted: {
    color: colors.inkSoft,
    textDecorationLine: "line-through",
  },
  emoji: {
    fontSize: 20,
  },
  listCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  meta: {
    color: colors.inkSoft,
    flexShrink: 1,
    fontSize: 12,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs + 2,
    marginTop: 2,
  },
  net: {
    alignItems: "flex-end",
  },
  netAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  netLabel: {
    fontSize: 11,
  },
  netMuted: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: "600",
  },
  netNone: {
    color: colors.inkSoft,
    fontSize: 11,
  },
  pill: {
    backgroundColor: colors.paper,
    borderRadius: radii.full,
    maxWidth: 120,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  pillGroup: {
    backgroundColor: colors.brand50,
  },
  pillGroupText: {
    color: colors.brand700,
  },
  pillText: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "500",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowPressed: {
    backgroundColor: colors.paper,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  settledLabel: {
    color: colors.pos600,
    fontSize: 11,
    fontWeight: "500",
  },
  settledRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
  },
});
