"use client";
/** Ledger preview: the animated sample ledger that explains HaalKhata on the login page. */

import { Check, CircleDollarSign, ReceiptText } from "lucide-react";
import { SAMPLE_EXPENSES, SAMPLE_PARTICIPANTS } from "../../constants/loginPage";
import styles from "../../LoginPage.module.css";

/**
 * Renders the animated product preview that explains HaalKhata at a glance.
 *
 * @returns A sample weekend ledger with receipt scanning and a resolved balance.
 */
export function LedgerPreview() {
  return (
    <section
      aria-label="A sample shared-expense ledger"
      className={`${styles.ledger} relative min-h-[330px] overflow-hidden rounded-[1.75rem] border border-line bg-card p-5 sm:p-6`}
    >
      <div className="relative z-10 flex items-start justify-between gap-4 pr-0 sm:pr-44">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            <span className="h-2 w-2 rounded-full bg-brand-500" /> Trip math, tamed
          </div>
          <h2 className="text-2xl font-bold">Trip to Yosemite</h2>
          <p className="mt-1 text-sm text-ink-soft">4 friends · one shared ledger</p>
        </div>
        <div className="flex -space-x-2" aria-label="Oni, Dot, PZ and Jess">
          {SAMPLE_PARTICIPANTS.map((participant) => (
            <span
              key={participant.initials}
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold ${participant.colorClass}`}
            >
              {participant.initials}
            </span>
          ))}
        </div>
      </div>

      <div
        className={`${styles.receipt} absolute top-5 right-5 z-20 w-36 overflow-hidden rounded-md border border-line bg-white px-4 py-3`}
        aria-label="A receipt being scanned"
      >
        <div className="flex items-center justify-between border-b border-dashed border-line pb-2">
          <ReceiptText className="h-4 w-4 text-brand-600" />
          <span className="text-[8px] font-bold tracking-[0.16em] text-ink-soft">RECEIPT</span>
        </div>
        <div className="mt-2 space-y-1.5 text-[8px] text-ink-soft">
          <div className="flex justify-between"><span>Trail snacks</span><span>$24.00</span></div>
          <div className="flex justify-between"><span>Picnic supplies</span><span>$52.00</span></div>
          <div className="flex justify-between"><span>Firewood</span><span>$32.00</span></div>
          <div className="flex justify-between"><span>tax</span><span>$12.00</span></div>
          <div className="mt-2 flex justify-between border-t border-line pt-1.5 font-bold text-ink">
            <span>total</span><span>$120.00</span>
          </div>
        </div>
        <span
          className={`${styles.stamp} mt-2 block rounded border border-brand-500 px-1.5 py-1 text-center text-[7px] font-black tracking-[0.12em] text-brand-600`}
        >
          3 ITEMS FOUND
        </span>
      </div>

      <div className={`${styles.expenseList} relative z-10 mt-7 space-y-2`}>
        {SAMPLE_EXPENSES.map((expense) => (
          <div
            key={expense.title}
            className={`${styles.expenseRow} ${styles[expense.delayClass]} flex items-center gap-3 rounded-xl border border-line/80 bg-card/90 px-3 py-2.5 backdrop-blur-sm`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CircleDollarSign className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{expense.title}</span>
              <span className="block text-xs text-ink-soft">{expense.payer}</span>
            </span>
            <span className="text-sm font-bold">{expense.amount}</span>
          </div>
        ))}
      </div>

      <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex items-center gap-2 text-xs font-medium text-ink-soft">
          <Check className="h-4 w-4 text-pos-600" /> Split exactly to the cent
        </span>
        <span className={`${styles.balanceGlow} rounded-full bg-pos-50 px-3 py-1.5 text-sm font-bold text-pos-700`}>
          Oni gets back $15.00
        </span>
      </div>
    </section>
  );
}
