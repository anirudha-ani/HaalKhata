"use client";
/** First-run screen: name, currency, phone — plus the merge confirmation. */

import { CURRENCIES } from "@haalkhata/shared/money/money.constants";
import { MergePreview } from "@/components/account/MergePreview";
import { PhoneField } from "@/components/ui/PhoneField";
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
  const verifying = onboarding.verificationPhone !== "";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-ink">
            {merge ? "Is this you?" : verifying ? "Verify your phone" : "Welcome to HaalKhata"}
          </h1>
          <p className="mt-3 text-sm text-ink-soft">
            {merge
              ? "Someone already added this number to shared expenses."
              : verifying
                ? `Enter the code sent to ${onboarding.verificationPhone}.`
              : "A couple of details, so friends can find you. You can skip any of it."}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          {merge ? (
            <div className="flex flex-col gap-4">
              <MergePreview preview={merge} currency={onboarding.currency || "USD"} />

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
          ) : verifying ? (
            <div className="flex flex-col gap-4">
              <input
                value={onboarding.verificationCode}
                onChange={(event) =>
                  onboarding.setVerificationCode(event.target.value.replace(/\D/g, ""))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                aria-label="Verification code"
                className={`${inputClass} text-center text-lg tracking-[0.35em]`}
              />
              {onboarding.error ? (
                <p className="text-sm text-brand-600">{onboarding.error}</p>
              ) : null}
              <button
                type="button"
                onClick={onboarding.verifyPhone}
                disabled={onboarding.isPending || onboarding.verificationCode.length < 4}
                className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {onboarding.isPending ? "Verifying…" : "Verify phone"}
              </button>
              <button
                type="button"
                onClick={onboarding.cancelVerification}
                disabled={onboarding.isPending}
                className="w-full rounded-xl border border-line py-3 text-sm font-semibold text-ink-soft transition-colors hover:bg-paper disabled:opacity-50"
              >
                Use a different number
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
              <PhoneField
                region={onboarding.region}
                nationalNumber={onboarding.nationalNumber}
                onRegionChange={onboarding.setRegion}
                onNationalNumberChange={onboarding.setNationalNumber}
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
