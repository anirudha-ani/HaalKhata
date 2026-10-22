"use client";
/** First-run screen: name, currency, phone, plus the merge confirmation, then an optional payment step. */

import { useId } from "react";
import { CurrencySelect } from "@/components/ui/CurrencySelect/CurrencySelect";
import { MergePreview } from "@/components/account/MergePreview/MergePreview";
import { PhoneField } from "@/components/ui/PhoneField/PhoneField";
import { ContactDiscoveryToggle } from "@/components/account/ContactDiscoveryToggle/ContactDiscoveryToggle";
import { useOnboarding } from "./hooks/useOnboarding";
import { PaymentStep } from "./components/PaymentStep/PaymentStep";
import { MAX_USER_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { VERIFICATION_CODE_INPUT_MAX_CHARACTERS } from "@haalkhata/shared/phone/phone.constants";
import { inputClass } from "./constants/onboardingPage";

/**
 * Renders the first-run flow: a short profile form, an optional phone number,
 * and — when that number turns out to belong to an invitation someone already
 * created — a confirmation naming exactly what would be absorbed. It ends on
 * an optional step for saying how you want to be paid.
 *
 * @returns The onboarding screen.
 */
export function OnboardingPage() {
  const onboarding = useOnboarding();
  const codeHintId = useId();

  if (onboarding.isLoading) {
    return <main className="flex min-h-dvh items-center justify-center bg-paper" />;
  }

  const merge = onboarding.pendingMerge;
  const verifying = onboarding.verificationPhone !== "";
  const paying = onboarding.step === "payment";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-ink">
            {paying
              ? "How do you want to be paid?"
              : merge
                ? "Is this you?"
                : verifying
                  ? "Verify your phone"
                  : "Welcome to HaalKhata"}
          </h1>
          <p className="mt-3 text-sm text-ink-soft">
            {paying
              ? "Optional. Add it now so nobody has to ask where to send money, or do it later."
              : merge
                ? "Someone already added this number to shared expenses."
                : verifying
                  ? `Enter the code sent to ${onboarding.verificationPhone}.`
                  : "A couple of details, so friends can find you. You can skip any of it."}
          </p>
        </div>

        {paying ? (
          <PaymentStep
            defaultCurrency={onboarding.currency || "USD"}
            error={onboarding.error}
            pending={onboarding.isPending}
            onFinish={onboarding.complete}
          />
        ) : (
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
              <div className="flex flex-col gap-1.5">
                <input
                  value={onboarding.verificationCode}
                  onChange={(event) => onboarding.enterVerificationCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={VERIFICATION_CODE_INPUT_MAX_CHARACTERS}
                  aria-label="Verification code"
                  aria-describedby={codeHintId}
                  className={`${inputClass} text-center text-lg tracking-[0.35em]`}
                />
                <p id={codeHintId} className="text-xs text-ink-soft">
                  {onboarding.codeHint}
                </p>
              </div>
              {onboarding.error ? (
                <p className="text-sm text-brand-600">{onboarding.error}</p>
              ) : null}
              <button
                type="button"
                onClick={onboarding.verifyPhone}
                disabled={onboarding.isPending || !onboarding.codeComplete}
                className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {onboarding.isVerifying ? "Verifying…" : "Verify phone"}
              </button>
              <button
                type="button"
                onClick={onboarding.resendCode}
                disabled={onboarding.isPending}
                className="text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-50"
              >
                {onboarding.isResending ? "Sending…" : "Send the code again"}
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
                maxLength={MAX_USER_NAME_LENGTH}
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

              <div className="mt-2 rounded-xl border border-line px-3 py-2">
                <ContactDiscoveryToggle
                  checked={onboarding.findable}
                  disabled={onboarding.isPending}
                  onChange={onboarding.setFindable}
                />
              </div>

              <label className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Default currency
              </label>
              <CurrencySelect
                value={onboarding.currency}
                onChange={onboarding.setCurrency}
                ariaLabel="Default currency"
              />

              {onboarding.error ? (
                <p className="text-sm text-brand-600">{onboarding.error}</p>
              ) : null}

              <button
                type="submit"
                disabled={onboarding.isPending}
                className="mt-3 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {onboarding.isPending ? "One moment…" : "Continue"}
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
        )}
      </div>
    </main>
  );
}
