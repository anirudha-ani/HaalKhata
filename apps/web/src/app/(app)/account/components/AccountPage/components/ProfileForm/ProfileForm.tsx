"use client";
/** Account settings: profile, payments, sharing, privacy, support and account access. */

import { NotificationSettings } from "@/components/account/NotificationSettings/NotificationSettings";
import { ReceiptPermission } from "@/components/account/ReceiptPermission/ReceiptPermission";
import { BlockedPeople } from "@/components/safety/BlockedPeople/BlockedPeople";
import { LegalLinks } from "@/components/legal/LegalLinks/LegalLinks";
import { DeleteAccount } from "@/components/account/DeleteAccount/DeleteAccount";
import { ACCOUNT_SETTINGS_COPY } from "@haalkhata/shared/account/settingsCopy";
import { Check, LogOut, Share2 } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { MergePreview } from "@/components/account/MergePreview/MergePreview";
import { Modal } from "@/components/ui/Modal/Modal";
import { InviteShareModal } from "@/components/modals/InviteShareModal/InviteShareModal";
import { shareProfileInvite } from "@/lib/invite/share";
import { PhoneField } from "@/components/ui/PhoneField/PhoneField";
import { CurrencySelect } from "@/components/ui/CurrencySelect/CurrencySelect";
import { useProfileForm } from "./hooks/useProfileForm";
import { MAX_USER_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { PaymentMethodsCard } from "@/components/payment/PaymentMethodsCard/PaymentMethodsCard";

/**
 * Renders the profile summary card, the editable profile form (display name,
 * phone and default currency), the payment methods card, and the sign-out
 * button.
 *
 * @param props - Component props.
 * @param props.me - The signed-in user whose profile is shown and edited.
 * @returns The profile form section of the account page.
 */
export function ProfileForm({ me: currentUser }: { me: User }) {
  const form = useProfileForm(currentUser);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-3xl font-bold">Account</h1>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <form
            className="space-y-4 rounded-2xl border border-line bg-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              form.save();
            }}
          >
            <h2 className="text-lg font-semibold">{ACCOUNT_SETTINGS_COPY.profile}</h2>
            <div className="flex items-center gap-4 border-b border-line pb-5">
              <Avatar user={currentUser} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{currentUser.name}</p>
                <p className="truncate text-sm text-ink-soft">{currentUser.email}</p>
              </div>
            </div>

            <label className="block text-sm font-medium">
              Display name
              <input
                value={form.name}
                onChange={(event) => form.setName(event.target.value)}
                maxLength={MAX_USER_NAME_LENGTH}
                required
                className="mt-1 w-full rounded-xl border border-line bg-card px-3.5 py-2.5 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <div className="text-sm font-medium">
              Phone number
              {currentUser.phone && form.phoneVerified ? (
                /* The stamp is stored, not inferred (§35): numbers written before
                   verification existed must not wear the chip unearned. */
                <span className="ml-2 rounded-full bg-pos-50 px-2 py-0.5 text-[11px] font-semibold text-pos-700">
                  ✓ verified
                </span>
              ) : null}
              {currentUser.phone && !form.phoneVerified ? (
                <>
                  <span className="ml-2 rounded-full bg-neg-50 px-2 py-0.5 text-[11px] font-semibold text-neg-700">
                    not verified
                  </span>
                  <button
                    type="button"
                    onClick={form.verifyCurrentPhone}
                    disabled={form.isRequestingVerification}
                    className="ml-2 text-[11px] font-semibold text-brand-600 underline disabled:opacity-50"
                  >
                    {form.isRequestingVerification ? "Sending code…" : "Verify now"}
                  </button>
                </>
              ) : null}
              <div className="mt-1">
                <PhoneField
                  region={form.region}
                  nationalNumber={form.nationalNumber}
                  onRegionChange={form.setRegion}
                  onNationalNumberChange={form.setNationalNumber}
                />
              </div>
              {/* Beside the field it is about, not with the save button at the
              bottom of the form: a rejected number is something to correct
              here, and "already on another account" makes no sense read under
              the currency. */}
              {form.error ? (
                <p className="mt-1.5 text-sm font-medium text-brand-600">{form.error}</p>
              ) : (
                <p className="mt-1 text-xs font-normal text-ink-soft">
                  Only so friends can find you when they split something. Never used to sign in.
                </p>
              )}
              {form.hasPhone ? (
                <button
                  type="button"
                  onClick={form.removePhone}
                  disabled={form.isRemovingPhone}
                  className="mt-1.5 text-xs font-semibold text-ink-soft underline-offset-2 hover:text-brand-600 hover:underline disabled:opacity-50"
                >
                  {form.isRemovingPhone ? "Removing…" : "Remove this number"}
                </button>
              ) : null}
            </div>
            <label className="block text-sm font-medium">
              Default currency
              <CurrencySelect value={form.currency} onChange={form.setCurrency} ariaLabel="Default currency" />
            </label>

            {/* The status lives on the button that caused it. An earlier version
            put "Saved ✓" in a paragraph above — which pushed the button down
            the instant it appeared — and then in a floating toast, which was
            a lot of furniture for one word. Here nothing moves: the button
            keeps its box and only its colour and label change. */}
            <button
              type="submit"
              disabled={form.isSaving}
              className={`w-full rounded-xl py-3 font-semibold text-white transition-colors duration-300 disabled:opacity-70 ${
                form.saved ? "bg-pos-600" : "bg-brand-600 hover:bg-brand-700"
              }`}
            >
              <span className="inline-flex items-center justify-center gap-2">
                {form.saved ? <Check className="animate-pop-in h-5 w-5" /> : null}
                {form.isSaving ? "Saving…" : form.saved ? "Saved" : "Save changes"}
              </span>
            </button>
          </form>

          {/* Outside the form above on purpose: each method saves on its own. */}
          <PaymentMethodsCard defaultCurrency={currentUser.defaultCurrency || "USD"} />

        </div>
        <div className="min-w-0 space-y-6">
          {/* The add-me link: the frictionless way for others to find you.
          Accepting it sends you a normal friend request to confirm. */}
          <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
            <h2 className="text-lg font-semibold">{ACCOUNT_SETTINGS_COPY.sharing}</h2>
            <p className="text-sm leading-relaxed text-ink-soft">{ACCOUNT_SETTINGS_COPY.sharingHint}</p>
            <button
              type="button"
              disabled={form.isSharingProfile}
              onClick={form.shareProfile}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-card py-3 font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600 disabled:opacity-50"
            >
              <Share2 className="h-4 w-4" />
              {form.isSharingProfile ? "Opening…" : "Share my profile"}
            </button>
            {form.profileNotice ? (
              <p className="text-center text-sm font-medium text-pos-700">{form.profileNotice}</p>
            ) : (
              <button
                type="button"
                disabled={form.isResettingProfileLink}
                onClick={form.resetProfileLink}
                className="block min-h-11 w-full text-center text-sm font-semibold text-ink-soft underline-offset-2 hover:text-brand-600 hover:underline disabled:opacity-50"
              >
                {form.isResettingProfileLink ? "Resetting…" : ACCOUNT_SETTINGS_COPY.resetLink}
              </button>
            )}
          </section>

          <NotificationSettings />
          <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
            <h2 className="text-lg font-semibold">{ACCOUNT_SETTINGS_COPY.privacy}</h2>
            <ReceiptPermission embedded />
            <div className="border-t border-line pt-4"><BlockedPeople /></div>
          </section>
          <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
            <h2 className="text-lg font-semibold">{ACCOUNT_SETTINGS_COPY.support}</h2>
            <LegalLinks layout="rows" />
          </section>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">{ACCOUNT_SETTINGS_COPY.access}</h2>
        <div className="grid items-center gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={form.signOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-card py-3 font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
          <DeleteAccount />
        </div>
      </section>

      {form.profileShareToken ? (
        <InviteShareModal
          title="Share my profile"
          explainer="Anyone who scans this or opens the link can send you a friend request."
          token={form.profileShareToken}
          share={() => shareProfileInvite(form.profileShareToken, currentUser.name)}
          onClose={form.closeProfileShare}
        />
      ) : null}

      {form.verificationPhone ? (
        <Modal title="Verify your phone" onClose={form.cancelVerification}>
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              Enter the code sent to {form.verificationPhone}. No account data changes until the
              code is confirmed.
            </p>
            <input
              value={form.verificationCode}
              onChange={(event) => form.setVerificationCode(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              aria-label="Verification code"
              className="w-full rounded-xl border border-line bg-card px-3.5 py-3 text-center text-lg tracking-[0.35em] focus:border-brand-500 focus:outline-none"
            />
            {form.error ? <p className="text-sm text-brand-600">{form.error}</p> : null}
            <button
              type="button"
              onClick={form.verifyPhone}
              disabled={form.isSaving || form.verificationCode.length < 4}
              className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {form.isSaving ? "Verifying…" : "Verify phone"}
            </button>
          </div>
        </Modal>
      ) : null}

      {/* A number can already belong to an invitation someone made. Nothing is
          written until this is answered, so it is a decision, not a notice. */}
      {form.pendingMerge ? (
        <Modal title="Is this you?" onClose={form.declineMerge}>
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              Someone already added this number to shared expenses.
            </p>
            <MergePreview preview={form.pendingMerge} currency={form.currency} />
            <p className="text-xs leading-relaxed text-ink-soft">
              If you recognize these people, this history is yours and will move onto your
              account. If you don&apos;t, the number was probably reassigned — leave it off.
            </p>

            {/* The dialog answers for itself. A refusal written into the form
                behind the backdrop is a refusal nobody sees. */}
            {form.error ? (
              <p className="text-sm font-medium text-brand-600">{form.error}</p>
            ) : null}

            <button
              type="button"
              onClick={form.confirmMerge}
              disabled={form.isSaving}
              className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {form.isSaving ? "One moment…" : "Yes, that's me"}
            </button>
            <button
              type="button"
              onClick={form.declineMerge}
              disabled={form.isSaving}
              className="w-full rounded-xl border border-line py-3 text-sm font-semibold text-ink-soft hover:bg-paper disabled:opacity-50"
            >
              That&apos;s not me
            </button>
          </div>
        </Modal>
      ) : null}

    </div>
  );
}
