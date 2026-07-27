"use client";
/** Account page: view/edit profile (name, default currency) and sign out. */

import { LogOut } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar";
import { MergePreview } from "@/components/account/MergePreview";
import { Modal } from "@/components/ui/Modal";
import { PhoneField } from "@/components/ui/PhoneField";
import { Spinner } from "@/components/ui/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { CURRENCIES } from "@haalkhata/shared/money/money.constants";
import { HANDLE_METHODS } from "@haalkhata/shared/payment/methods";
import { useAccountAPI, useProfileForm } from "./hooks/useAccount";

/**
 * Renders the account screen: a spinner until the signed-in user is loaded,
 * then the profile form for that user.
 *
 * @returns The account page content.
 */
export function AccountPage() {
  const { me: currentUser, isLoading } = useAccountAPI();
  const hydrated = useHydrated();
  if (!hydrated || isLoading || !currentUser) return <Spinner />;
  return <ProfileForm me={currentUser} />;
}

/**
 * Renders the profile summary card, the editable profile form (display name
 * and default currency), and the sign-out button.
 *
 * @param props - Component props.
 * @param props.me - The signed-in user whose profile is shown and edited.
 * @returns The profile form section of the account page.
 */
function ProfileForm({ me: currentUser }: { me: User }) {
  const form = useProfileForm(currentUser);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-3xl font-bold">Account</h1>

      <div className="flex items-center gap-4 rounded-2xl border border-line bg-card p-5">
        <Avatar user={currentUser} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{currentUser.name}</p>
          <p className="truncate text-sm text-ink-soft">{currentUser.email}</p>
        </div>
      </div>

      <form
        className="space-y-4 rounded-2xl border border-line bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          form.save();
        }}
      >
        <label className="block text-sm font-medium">
          Display name
          <input
            value={form.name}
            onChange={(event) => form.setName(event.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-line bg-card px-3.5 py-2.5 focus:border-brand-500 focus:outline-none"
          />
        </label>
        <div className="text-sm font-medium">
          Phone number
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
              the payment handles. */}
          {form.error ? (
            <p className="mt-1.5 text-sm font-medium text-brand-600">{form.error}</p>
          ) : (
            <p className="mt-1 text-xs font-normal text-ink-soft">
              Only so friends can find you when they split something. Never used to sign in.
            </p>
          )}
        </div>
        <label className="block text-sm font-medium">
          Default currency
          <select
            value={form.currency}
            onChange={(event) => form.setCurrency(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2.5 focus:border-brand-500 focus:outline-none"
          >
            {CURRENCIES.map((currencyCode) => (
              <option key={currencyCode}>{currencyCode}</option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-2 border-t border-line pt-4">
          <legend className="sr-only">Payment handles</legend>
          <p className="text-sm font-medium">Get paid</p>
          <p className="text-xs text-ink-soft">
            Whoever owes you sees these when they settle up, so they can pay you without
            asking where to send it. Leave one blank if you don&apos;t use it.
          </p>
          {HANDLE_METHODS.map((method) => (
            <label key={method.key} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-ink-soft">{method.label}</span>
              <input
                value={form.handles[method.key] ?? ""}
                onChange={(event) => form.setHandle(method.key, event.target.value)}
                placeholder={method.handleLabel}
                className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 focus:border-brand-500 focus:outline-none"
              />
            </label>
          ))}
        </fieldset>

        {form.message ? <p className="text-sm text-ink-soft">{form.message}</p> : null}
        <button
          type="submit"
          disabled={form.isSaving}
          className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {form.isSaving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <button
        type="button"
        onClick={form.signOut}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-card py-3 font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>

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
