"use client";
/** First-run screen: name, currency, phone — plus the merge confirmation. */

import { CURRENCIES } from "@haalkhata/shared/money/money.constants";
import { formatMoney } from "@haalkhata/shared/money/money";
import { useOnboarding } from "./hooks/useOnboarding";

/** Shared styling for the onboarding inputs. */
const inputClass =
  "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-[15px] focus:border-brand-500 focus:outline-none";

/**
 * Renders the first-run flow: a short profile form, an optional phone number,
 * and — when that number turns out to belong to an invitation someone already
 * created — a confirmation naming exactly what would be absorbed.
 *
 * @returns The onboarding screen.
 */
export function OnboardingPage() {
  const onboarding = useOnboarding();

  if (onboarding.isLoading) {
    return <main className="flex min-h-dvh items-center justify-center bg-paper" />;
  }

  const merge = onboarding.pendingMerge;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-ink">
            {merge ? "Is this you?" : "Welcome to HaalKhata"}
          </h1>
          <p className="mt-3 text-sm text-ink-soft">
            {merge
              ? "Someone already added this number to shared expenses."
              : "A couple of details, so friends can find you. You can skip any of it."}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          {merge ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-line bg-paper p-4">
                <p className="font-display text-lg text-ink">{merge.name}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {merge.expenseCount} {merge.expenseCount === 1 ? "expense" : "expenses"}
                  {merge.netCents !== 0 ? (
                    <>
                      {" · "}
                      <span className={merge.netCents > 0 ? "text-pos-600" : "text-neg-600"}>
                        {merge.netCents > 0 ? "owed " : "owes "}
                        {formatMoney(Math.abs(merge.netCents), "USD")}
                      </span>
                    </>
                  ) : null}
                </p>
                {merge.counterpartyNames.length > 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">
                    Shared with {merge.counterpartyNames.join(", ")}
                  </p>
                ) : null}
              </div>

              <p className="text-xs leading-relaxed text-ink-soft">
                If you recognize these people, this history is yours and will move onto your
                account. If you don&apos;t, the number was probably reassigned — go back and
                leave it off.
              </p>

              {onboarding.error ? (
                <p className="text-sm text-brand-600">{onboarding.error}</p>
              ) : null}

              <button
                type="button"
                onClick={onboarding.confirmMerge}
                disabled={onboarding.isPending}
                className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {onboarding.isPending ? "One moment…" : "Yes, that's me"}
              </button>
              <button
                type="button"
                onClick={onboarding.declineMerge}
                disabled={onboarding.isPending}
                className="w-full rounded-xl border border-line py-3 text-sm font-semibold text-ink-soft transition-colors hover:bg-paper disabled:opacity-50"
              >
                That&apos;s not me
              </button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                onboarding.save();
              }}
            >
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Your name
              </label>
              <input
                className={inputClass}
                value={onboarding.name}
                onChange={(event) => onboarding.setName(event.target.value)}
                autoComplete="name"
                required
              />

              <label className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Phone number
              </label>
              <input
                className={inputClass}
                type="tel"
                placeholder="(617) 555-1212"
                value={onboarding.phone}
                onChange={(event) => onboarding.setPhone(event.target.value)}
                autoComplete="tel"
              />
              <p className="text-xs text-ink-soft">
                Only so friends can find you when they split something. Never used to sign in.
              </p>

              <label className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Default currency
              </label>
              <select
                className={inputClass}
                value={onboarding.currency}
                onChange={(event) => onboarding.setCurrency(event.target.value)}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>

              {onboarding.error ? (
                <p className="text-sm text-brand-600">{onboarding.error}</p>
              ) : null}

              <button
                type="submit"
                disabled={onboarding.isPending}
                className="mt-3 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {onboarding.isPending ? "One moment…" : "Open your ledger"}
              </button>
              <button
                type="button"
                onClick={onboarding.skip}
                disabled={onboarding.isPending}
                className="text-sm text-ink-soft underline underline-offset-4 disabled:opacity-50"
              >
                Skip for now
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
