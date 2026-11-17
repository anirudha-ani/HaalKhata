"use client";
/** The bill page's pay-back card: what the reader owes on this bill and to whom, the button that pays it, and the payments made for it. */

import { useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { Expense, Repayment, Settlement } from "@haalkhata/shared/api/plainMessages";
import { SHOW_OLDER_PAYMENTS_LABEL } from "@haalkhata/shared/api/paging";
import { readRepayment } from "@haalkhata/shared/expense/repayment";
import { SettleUpModal } from "@/components/modals/SettleUpModal/SettleUpModal";
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
 * A row that would only say "square" is left out when the page's banner
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
  groupHref,
}: {
  /** The bill. */
  expense: Expense;
  /** What the reader owes on it, per person, from the server. */
  repayments: readonly Repayment[];
  /** Payments made for it that the reader is on, oldest first. */
  payments: readonly Settlement[];
  /** Continuation for payments older than this page. */
  cursor: string;
  /** Everyone the page names, by id. */
  userById: ReadonlyMap<string, User>;
  /** The reader's id. */
  meId: string;
  /** True when the page's banner says nothing is pending for the reader. */
  settledForViewer: boolean;
  /** The group's page, offered beside a refusal; "" for none. */
  groupHref: string;
}) {
  // The person being paid, not the figures: those are read fresh from the
  // page on every render, so the dialog never offers a stale amount.
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
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-ink-soft uppercase">
        {/* Whoever owes reads their share, owing or paid; whoever was paid reads what came back. */}
        {rows.length > 0 ? "Your share" : "Paid back"}
      </h2>
      {rows.length > 0 ? (
        <ul className="space-y-4">
          {rows.map(({ repayment, person, view }) =>
            person ? (
              <RepaymentRow
                key={repayment.userId}
                view={view}
                person={person}
                meId={meId}
                currency={expense.currency}
                groupHref={groupHref}
                onPay={() => setSelectedPerson(person)}
              />
            ) : null,
          )}
        </ul>
      ) : null}
      {payments.length > 0 ? (
        <ul className={`space-y-1.5 ${rows.length > 0 ? "mt-4 border-t border-line pt-3" : ""}`}>
          {history.hasMore ? (
            <li><button type="button" className="min-h-11 text-sm font-semibold text-brand-700" disabled={history.loading} onClick={history.load}>
              {SHOW_OLDER_PAYMENTS_LABEL}
            </button></li>
          ) : null}
          {history.error ? <li role="alert" className="text-sm text-brand-700">{history.error}</li> : null}
          {[...history.payments, ...payments].map((payment) => (
            <PaymentLine
              key={payment.id}
              payment={payment}
              meId={meId}
              otherFirstName={firstNameOf(payment.fromUserId === meId ? payment.toUserId : payment.fromUserId)}
            />
          ))}
        </ul>
      ) : null}
      {payingPerson ? (
        <SettleUpModal
          to={payingPerson}
          suggestedCents={paying?.payableCents ?? 0}
          currency={expense.currency}
          // The bill's own balance: its group, or the pair's outside groups.
          scopeId={expense.groupId}
          bill={{ expenseId: expense.id, description: expense.description, payableCents: paying?.payableCents ?? 0, refusal: paying?.refusal }}
          onClose={() => setSelectedPerson(null)}
        />
      ) : null}
    </section>
  );
}
