/** Expense list rows: category, payer summary, and your lent/borrowed net per expense. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { Expense } from "@haalkhata/protogen/expense/v1/expense_pb";
import { useRouter } from "expo-router";
import { ReceiptText } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { formatMoney } from "@/lib/money/money";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { CATEGORY_EMOJI } from "../../../../constants/categoryEmoji";

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
}: {
  /** Expenses to render, newest-first as returned by the server. */
  expenses: Expense[];
  /** The signed-in user's id, used to compute their lent/borrowed net per row. */
  meId: string | undefined;
  /** Lookup from user id to User for naming payers. */
  userById: Map<string, User>;
  /** Hint text for the empty state when there are no expenses. */
  emptyHint: string;
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
              <Text numberOfLines={1} style={styles.description}>
                {expense.description}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                {expense.expenseDate} · {payerLabel}{" "}
                {formatMoney(expense.amountCents, expense.currency)}
                {expense.splitType === "itemized" ? " · itemized" : ""}
              </Text>
            </View>
            <View style={styles.net}>
              {myNet === 0 ? (
                <Text style={styles.netNone}>not involved / even</Text>
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
    fontSize: 12,
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
  netNone: {
    color: colors.inkSoft,
    fontSize: 11,
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
});
