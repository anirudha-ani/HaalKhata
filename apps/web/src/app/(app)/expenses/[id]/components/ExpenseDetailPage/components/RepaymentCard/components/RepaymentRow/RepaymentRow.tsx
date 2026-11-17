"use client";
/** One person the reader owes on a bill: what is left to pay them, and the button that pays it back. */

import Link from "next/link";
import { Check, HandCoins, Lock } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import type { RepaymentView } from "@haalkhata/shared/expense/repayment";
import { PersonLink } from "@/components/people/PersonLink/PersonLink";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { Money } from "@/components/ui/Money/Money";

/**
 * Renders one repayment in its state:
 *
 * - due: who is owed and how much, then a full-width button that opens the
 *   pay-back dialog, labelled with the amount it pays;
 * - paid: a tick on the person's avatar and what was paid for the bill;
 * - square: nothing to pay, and why, with no button;
 * - blocked: what is owed, and in place of the button the reason a payment
 *   would be refused, with the group's page one tap away when there is one.
 *
 * @param props - Component props.
 * @returns The row.
 */
export function RepaymentRow({
  view,
  person,
  meId,
  currency,
  groupHref,
  onPay,
}: {
  /** The repayment, worded. */
  view: RepaymentView;
  /** Who is owed. */
  person: User;
  /** The reader's id, for the person link. */
  meId: string;
  /** The bill's currency. */
  currency: string;
  /** The group's page, offered beside a refusal; "" for none. */
  groupHref: string;
  /** Opens the pay-back dialog for this person. */
  onPay: () => void;
}) {
  const done = view.state === "paid" || view.state === "square";
  return (
    <li className="space-y-3">
      <div className="flex items-center gap-3">
        <PersonLink userId={person.id} meId={meId} className="relative shrink-0">
          <Avatar user={person} />
          {view.state === "paid" ? (
            <span className="absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-pos-600 text-white ring-2 ring-card">
              <Check className="h-3 w-3" aria-hidden="true" />
            </span>
          ) : null}
        </PersonLink>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${view.state === "paid" ? "text-pos-700" : ""}`}>
            {view.title}
          </p>
          {view.state === "blocked" ? null : <p className="text-xs text-ink-soft">{view.detail}</p>}
        </div>
        {view.state === "square" ? null : (
          <Money
            cents={view.amountCents}
            currency={currency}
            className={`shrink-0 font-bold ${done ? "text-sm text-ink-soft" : "text-lg text-neg-600"}`}
          />
        )}
      </div>
      {view.state === "due" ? (
        <button
          type="button"
          onClick={onPay}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-pos-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pos-700"
        >
          <HandCoins className="h-4 w-4" aria-hidden="true" />
          {view.action}
        </button>
      ) : null}
      {view.state === "blocked" ? (
        <div className="flex items-start gap-2 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink-soft">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {view.detail}
            {groupHref ? (
              <>
                {" "}
                <Link href={groupHref} className="font-semibold whitespace-nowrap text-brand-600">
                  Open group
                </Link>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
    </li>
  );
}
