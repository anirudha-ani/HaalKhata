/** The bill screen's pay-back card: what the reader owes on this bill and to whom, the button that pays it, and the payments made for it. */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { Expense, Repayment, Settlement } from "@haalkhata/shared/api/plainMessages";
import { SHOW_OLDER_PAYMENTS_LABEL } from "@haalkhata/shared/api/paging";
import { readRepayment } from "@haalkhata/shared/expense/repayment";
import { SettleUpModal } from "@/components/modals/SettleUpModal";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors, radii, spacing } from "@/lib/theme/theme";
import { useEarlierPaymentsAPI } from "./hooks/useEarlierPaymentsAPI";
import { PaymentLine } from "./components/PaymentLine/PaymentLine";
import { RepaymentRow } from "./components/RepaymentRow/RepaymentRow";

/**
 * Renders everything about paying this bill back that involves the reader.
 *
 * Someone who owes on the bill sees one row per person they owe, each with
 * what is left to pay and a button that pays exactly that (the button sits
 * beside the bill's own figure, so it settles the bill's share and nothing
 * else). Once paid, the row says so. Below the rows, and for the person who
 * was paid as well, every payment made for the bill that the reader is on.
 *
 * A row that would only say "square" is left out when the screen's banner
 * already says the reader's balance there is zero.
 *
 * @param props - Component props.
 * @returns The card, or null when there is nothing to show.
 */
export function RepaymentCard({
  expense,
  repayments,
  payments,
  cursor,
  userById,
  meId,
  settledForViewer,
  groupId,
}: {
  /** The bill. */
  expense: Expense;
  /** What the reader owes on it, per person, from the server. */
  repayments: readonly Repayment[];
  /** Payments made for it that the reader is on, oldest first. */
  payments: readonly Settlement[];
  /** Continuation for payments older than this page. */
  cursor: string;
  /** Everyone the screen names, by id. */
  userById: ReadonlyMap<string, User>;
  /** The reader's id. */
  meId: string;
  /** True when the screen's banner says nothing is pending for the reader. */
  settledForViewer: boolean;
  /** The group to offer beside a refusal; "" for none. */
  groupId: string;
}) {
  // The person being paid, not the figures: those are read fresh from the
  // screen on every render, so the sheet never offers a stale amount.
  const [selectedPerson, setSelectedPerson] = useState<User | null>(null);
  const history = useEarlierPaymentsAPI(expense.id, cursor);
  const firstNameOf = (userId: string) => (userById.get(userId) ?? history.people.get(userId))?.name.split(" ")[0] ?? "them";

  const rows = repayments
    .map((repayment) => ({
      repayment,
      person: userById.get(repayment.userId),
      view: readRepayment(repayment, firstNameOf(repayment.userId), expense.groupId !== "", expense.currency),
    }))
    .filter(({ view }) => !(settledForViewer && view.state === "square"));
  if (!selectedPerson && rows.length === 0 && payments.length === 0) return null;
  // Keep an open sheet long enough to explain an edit that removed this debt.
  const paying = repayments.find((repayment) => repayment.userId === selectedPerson?.id);
  const payingPerson = selectedPerson && (userById.get(selectedPerson.id) ?? selectedPerson);

  return (
    <View style={styles.card}>
      {/* Whoever owes reads their share, owing or paid; whoever was paid reads what came back. */}
      <Text style={styles.title}>{rows.length > 0 ? "YOUR SHARE" : "PAID BACK"}</Text>
      {rows.length > 0 ? (
        <View style={styles.rows}>
          {rows.map(({ repayment, person, view }) =>
            person ? (
              <RepaymentRow
                currency={expense.currency}
                groupId={groupId}
                key={repayment.userId}
                meId={meId}
                onPay={() => setSelectedPerson(person)}
                person={person}
                view={view}
              />
            ) : null,
          )}
        </View>
      ) : null}
      {payments.length > 0 ? (
        <View style={[styles.payments, rows.length > 0 ? styles.paymentsDivided : null]}>
          {history.hasMore ? <Button label={SHOW_OLDER_PAYMENTS_LABEL} onPress={history.load} disabled={history.loading} variant="outline" /> : null}
          {history.error ? <Text accessibilityRole="alert">{history.error}</Text> : null}
          {[...history.payments, ...payments].map((payment) => (
            <PaymentLine
              key={payment.id}
              meId={meId}
              otherFirstName={firstNameOf(payment.fromUserId === meId ? payment.toUserId : payment.fromUserId)}
              payment={payment}
            />
          ))}
        </View>
      ) : null}
      {payingPerson ? (
        <SettleUpModal
          bill={{ expenseId: expense.id, description: expense.description, payableCents: paying?.payableCents ?? 0, refusal: paying?.refusal }}
          currency={expense.currency}
          onClose={() => setSelectedPerson(null)}
          // The bill's own balance: its group, or the pair's outside groups.
          scopeId={expense.groupId}
          suggestedCents={paying?.payableCents ?? 0}
          to={payingPerson}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  payments: {
    gap: spacing.sm,
  },
  paymentsDivided: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: spacing.md,
  },
  rows: {
    gap: spacing.lg,
  },
  title: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
});
